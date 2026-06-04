from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ZetaClient:
    base_url: str
    access_token: str | None = None
    timeout: int = 120

    def login(self, username: str, password: str) -> "ZetaClient":
        payload = self.post(
            "/user/login",
            {"username": username, "password": password},
            authenticated=False,
        )
        token = payload["token"]["accessToken"]

        return ZetaClient(
            base_url=self.base_url,
            access_token=token,
            timeout=self.timeout,
        )

    def list_knowledge_bases(self) -> list[dict[str, Any]]:
        return self.get("/knowledge-bases")

    def list_agents(self) -> list[dict[str, Any]]:
        return self.get("/agents")

    def retrieval_test(
        self,
        knowledge_base_id: str,
        question: str,
        top_k: int,
    ) -> dict[str, Any]:
        return self.post(
            f"/knowledge-bases/{knowledge_base_id}/retrieval-test",
            {"question": question, "topK": top_k},
        )

    def chat(
        self,
        agent_id: str,
        message: str,
        top_k: int,
    ) -> dict[str, Any]:
        return self.post(
            f"/agents/{agent_id}/chat",
            {"message": message, "topK": top_k},
        )

    def get(self, path: str) -> Any:
        return self.request("GET", path)

    def post(
        self,
        path: str,
        body: dict[str, Any],
        authenticated: bool = True,
    ) -> Any:
        return self.request("POST", path, json=body, authenticated=authenticated)

    def request(
        self,
        method: str,
        path: str,
        authenticated: bool = True,
        **kwargs: Any,
    ) -> Any:
        try:
            import requests
        except ImportError as cause:
            raise RuntimeError(
                "Python package `requests` is required. "
                "Run `pip install -r evals/requirements.txt` first."
            ) from cause

        headers = dict(kwargs.pop("headers", {}))

        if authenticated:
            if not self.access_token:
                raise RuntimeError("Zeta access token is required")

            headers["Authorization"] = f"Bearer {self.access_token}"

        response = requests.request(
            method,
            f"{self.base_url.rstrip('/')}/{path.lstrip('/')}",
            headers=headers,
            timeout=self.timeout,
            **kwargs,
        )

        response.raise_for_status()

        payload = response.json()

        if payload.get("success") is False:
            raise RuntimeError(payload.get("message") or "Zeta API request failed")

        return payload.get("data")
