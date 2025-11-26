import os
from typing import Optional

import httpx


def get_embedding_dimension(
    model: str = "doubao-embedding-text-240715", token: Optional[str] = None, api_url: str = "/v1/embeddings"
) -> int:
    """
    Get embedding dimension by making a request to the embeddings API.

    Args:
        model: Model name for embeddings
        token: Authorization token (if None, tries to get from environment)
        api_url: API endpoint URL

    Returns:
        int: Embedding dimension
    """
    if token is None:
        token = os.getenv("token")

    if not token:
        raise ValueError("Token is required. Provide token parameter or set 'token' environment variable.")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    data = {"model": model, "input": "hi", "encoding_format": "float"}

    with httpx.Client() as client:
        response = client.post(api_url, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()

        # Get embedding dimension from first result
        embeddings = result.get("data", [])
        if not embeddings:
            raise ValueError("No embeddings returned from API")

        embedding = embeddings[0].get("embedding", [])
        return len(embedding)


if __name__ == "__main__":
    try:
        dim = get_embedding_dimension()
        print(f"Embedding dimension: {dim}")
    except Exception as e:
        print(f"Error: {e}")
