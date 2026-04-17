from fastapi import Header, HTTPException, status

from app.config import settings


async def require_internal_api_key(x_internal_api_key: str = Header(default="")) -> None:
    if x_internal_api_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing X-Internal-Api-Key",
        )
