import pytest
from unittest.mock import patch, MagicMock
from app.services.rag_service import detect_currency, rag_service

def test_detect_currency_mapping():
    """Verify that detect_currency correctly maps destinations to the appropriate currency and symbol."""
    # India
    assert detect_currency("Mumbai, India") == ("INR", "₹")
    assert detect_currency("Goa Trip") == ("INR", "₹")
    
    # Europe
    assert detect_currency("Paris, France") == ("EUR", "€")
    assert detect_currency("Rome, Italy") == ("EUR", "€")
    
    # UK
    assert detect_currency("London, UK") == ("GBP", "£")
    
    # Japan
    assert detect_currency("Tokyo, Japan") == ("JPY", "¥")
    
    # Canada
    assert detect_currency("Toronto, Canada") == ("CAD", "C$")
    
    # Fallback to USD
    assert detect_currency("New York City") == ("USD", "$")
    assert detect_currency("Singapore") == ("USD", "$")

def test_rag_retrieval_fallback():
    """Verify that RAG retrieves local guidebook items or falls back gracefully."""
    # When query matches nothing, should return empty list
    res = rag_service.retrieve_context("Moon Colony", "openai", "test_key")
    assert res == []

def test_rag_semantic_retrieval_mock():
    """Verify that similarity search returns top chunks when embeddings are generated."""
    dummy_chunks = [
        "Welcome to Tokyo Guide. Tokyo is a massive capital city.",
        "Sensō-ji Temple is a historic Buddhist spot in Asakusa. Cost: Free.",
        "Ichiran Ramen is famous for tonkotsu ramen."
    ]

    with patch.object(rag_service, "_load_and_chunk_guide", return_value=dummy_chunks), \
         patch.object(rag_service, "_get_embedding_model") as mock_embed_getter:
         
        # Setup mock embedding responses
        mock_embed = MagicMock()
        # Query vector
        mock_embed.embed_query.return_value = [0.1, 0.2, 0.3]
        # Document vectors (three 3D vectors)
        mock_embed.embed_documents.return_value = [
            [0.1, 0.2, 0.3], # identical to query (high score)
            [0.0, 0.1, 0.2],
            [0.9, 0.0, 0.0]
        ]
        mock_embed_getter.return_value = mock_embed
        
        context = rag_service.retrieve_context("Tokyo", "openai", "test_key")
        
        # Should return chunks ranked by similarity
        assert len(context) == 3
        # The first chunk should match the one with identical embedding vector
        assert context[0] == "Welcome to Tokyo Guide. Tokyo is a massive capital city."
