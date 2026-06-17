import os
import time
import uuid
import logging
import json
from typing import Callable, Any, Dict
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings

# Setup standard logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_travel_planner")
logger.setLevel(logging.INFO)

# Structured formatter
class StructuredJSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "funcName": record.funcName,
        }
        # Add custom fields if present
        if hasattr(record, "extra_fields"):
            log_record.update(record.extra_fields)
        return json.dumps(log_record)

# Assign structured formatting to console output
handler = logging.StreamHandler()
handler.setFormatter(StructuredJSONFormatter())
logger.handlers = [handler]
logger.propagate = False

# LangSmith environment variables configuration helper
def configure_langsmith():
    if settings.LANGCHAIN_TRACING_V2.lower() == "true" and settings.LANGCHAIN_API_KEY:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = settings.LANGCHAIN_API_KEY
        os.environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT
        logger.info("LangSmith tracing enabled successfully", extra={"extra_fields": {"observability": "langsmith"}})
    else:
        os.environ["LANGCHAIN_TRACING_V2"] = "false"
        logger.info("LangSmith tracing is disabled (no API key or disabled in settings)")

# Custom Request Tracing Middleware
class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate trace/correlation ID
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        
        # Track start time
        start_time = time.time()
        
        # Log request receipt
        logger.info(
            f"Incoming request: {request.method} {request.url.path}",
            extra={
                "extra_fields": {
                    "trace_id": correlation_id,
                    "method": request.method,
                    "path": request.url.path,
                    "query_params": str(request.query_params),
                    "action": "request_start"
                }
            }
        )
        
        # Attach correlation ID to request state
        request.state.correlation_id = correlation_id
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            
            # Add trace ID to headers
            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["X-Process-Time"] = f"{process_time:.4f}s"
            
            # Log successful response
            logger.info(
                f"Request completed: {request.method} {request.url.path} with status {response.status_code} in {process_time:.4f}s",
                extra={
                    "extra_fields": {
                        "trace_id": correlation_id,
                        "status_code": response.status_code,
                        "duration_sec": process_time,
                        "action": "request_end"
                    }
                }
            )
            return response
        except Exception as e:
            process_time = time.time() - start_time
            # Log failure
            logger.error(
                f"Request failed: {request.method} {request.url.path} - Exception: {str(e)}",
                exc_info=True,
                extra={
                    "extra_fields": {
                        "trace_id": correlation_id,
                        "duration_sec": process_time,
                        "action": "request_failed",
                        "error": str(e)
                    }
                }
            )
            raise e

# LangGraph Node execution tracer decorator/logger
def trace_graph_node(node_name: str):
    def decorator(func: Callable):
        def wrapper(state: Dict[str, Any], *args, **kwargs):
            start_time = time.time()
            logger.info(
                f"LangGraph Node started: {node_name}",
                extra={
                    "extra_fields": {
                        "node": node_name,
                        "action": "node_start",
                        "destination": state.get("destination"),
                        "budget": state.get("budget"),
                        "days": state.get("days")
                    }
                }
            )
            try:
                result = func(state, *args, **kwargs)
                duration = time.time() - start_time
                logger.info(
                    f"LangGraph Node completed: {node_name} in {duration:.4f}s",
                    extra={
                        "extra_fields": {
                            "node": node_name,
                            "action": "node_complete",
                            "duration_sec": duration,
                            "status": "success"
                        }
                    }
                )
                return result
            except Exception as e:
                duration = time.time() - start_time
                logger.error(
                    f"LangGraph Node failed: {node_name} in {duration:.4f}s - Exception: {str(e)}",
                    exc_info=True,
                    extra={
                        "extra_fields": {
                            "node": node_name,
                            "action": "node_failed",
                            "duration_sec": duration,
                            "status": "failed",
                            "error": str(e)
                        }
                    }
                )
                raise e
        return wrapper
    return decorator
