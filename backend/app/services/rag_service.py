import os
import math
from typing import List, Dict, Any, Tuple
from langchain_openai import OpenAIEmbeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from app.config import settings
from app.observability import logger

def detect_currency(destination: str) -> Tuple[str, str]:
    """
    Detects currency and currency symbol based on keywords in the destination.
    Supports INR, EUR, GBP, JPY, AUD, CAD, and defaults to USD.
    """
    dest = destination.lower()
    if any(k in dest for k in ["india", "mumbai", "delhi", "goa", "bangalore", "inr", "rupee", "rupya"]):
        return "INR", "₹"
    elif any(k in dest for k in ["france", "paris", "italy", "rome", "spain", "barcelona", "germany", "berlin", "europe", "eur", "amsterdam", "netherlands"]):
        return "EUR", "€"
    elif any(k in dest for k in ["london", "uk", "england", "united kingdom", "britain", "gbp", "pound"]):
        return "GBP", "£"
    elif any(k in dest for k in ["japan", "tokyo", "osaka", "kyoto", "jpy", "yen"]):
        return "JPY", "¥"
    elif any(k in dest for k in ["australia", "sydney", "melbourne", "aud"]):
        return "AUD", "A$"
    elif any(k in dest for k in ["canada", "toronto", "vancouver", "cad"]):
        return "CAD", "C$"
    else:
        return "USD", "$"

class RAGService:
    def __init__(self):
        self.data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
        
    def _get_embedding_model(self, provider: str, custom_key: str = None):
        """Initializes the correct LangChain embeddings model based on the provider."""
        if provider.lower() == "openai":
            api_key = custom_key or settings.OPENAI_API_KEY
            if not api_key:
                raise ValueError("OpenAI API key missing for embeddings.")
            return OpenAIEmbeddings(
                model="text-embedding-3-small",
                openai_api_key=api_key
            )
        elif provider.lower() == "gemini":
            api_key = custom_key or settings.GOOGLE_API_KEY
            if not api_key:
                raise ValueError("Gemini API key missing for embeddings.")
            return GoogleGenerativeAIEmbeddings(
                model="models/text-embedding-004",
                google_api_key=api_key
            )
        else:
            raise ValueError(f"Unsupported embeddings provider: {provider}")

    def _load_and_chunk_guide(self, filename: str) -> List[str]:
        """Loads a guidebook markdown and splits it into logical sections/paragraphs."""
        file_path = os.path.join(self.data_dir, filename)
        if not os.path.exists(file_path):
            return []
            
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Split by markdown headers or double newlines
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        return paragraphs

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Computes the cosine similarity between two vector lists using pure Python math."""
        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot_product / (norm_a * norm_b)

    def retrieve_context(self, destination: str, provider: str, custom_key: str = None) -> List[str]:
        """
        Retrieves relevant guide snippets based on the destination.
        1. Selects the guidebook matching the destination.
        2. Computes embeddings for chunks and query.
        3. Ranks chunks via cosine similarity and returns top matches.
        """
        dest = destination.lower()
        guide_file = None
        
        # Match destination to local guidebook files
        if "tokyo" in dest or "japan" in dest:
            guide_file = "tokyo_guide.md"
        elif "paris" in dest or "france" in dest:
            guide_file = "paris_guide.md"
        elif "rome" in dest or "italy" in dest:
            guide_file = "rome_guide.md"
        elif "india" in dest or "mumbai" in dest or "delhi" in dest or "goa" in dest:
            guide_file = "india_guide.md"
            
        if not guide_file:
            logger.info(f"No local RAG guidebook found for destination: {destination}. Falling back to parametric memory.")
            return []
            
        chunks = self._load_and_chunk_guide(guide_file)
        if not chunks:
            return []
            
        try:
            # Initialize embeddings model
            embed_model = self._get_embedding_model(provider, custom_key)
            
            # Embed the query (destination name + planning query)
            query_vector = embed_model.embed_query(f"planning travel itinerary lodging sights attractions restaurants in {destination}")
            
            # Embed all paragraphs/chunks
            chunk_vectors = embed_model.embed_documents(chunks)
            
            # Compute similarity scores
            scored_chunks = []
            for chunk, vector in zip(chunks, chunk_vectors):
                score = self._cosine_similarity(query_vector, vector)
                scored_chunks.append((score, chunk))
                
            # Sort by score descending and take top 3
            scored_chunks.sort(key=lambda x: x[0], reverse=True)
            top_matches = [chunk for score, chunk in scored_chunks[:3]]
            
            logger.info(f"Successfully retrieved {len(top_matches)} RAG chunks for destination: {destination}")
            return top_matches
        except Exception as e:
            logger.error(f"RAG Retrieval failed: {str(e)}. Falling back to direct layout.", exc_info=True)
            # Safe fallback: return first 3 paragraphs as un-embedded matches
            return chunks[:3]

rag_service = RAGService()
