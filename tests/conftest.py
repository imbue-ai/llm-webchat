from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlite_utils
from fastapi import FastAPI
from starlette.testclient import TestClient

from llm_webchat.server import create_application


@pytest.fixture()
def llm_user_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setenv("LLM_USER_PATH", str(tmp_path))
    return tmp_path


@pytest.fixture()
def test_database(llm_user_path: Path) -> sqlite_utils.Database:
    database_path = llm_user_path / "logs.db"
    return sqlite_utils.Database(str(database_path))


@pytest.fixture()
def application(llm_user_path: Path) -> FastAPI:
    return create_application()


@pytest.fixture()
def client(application: FastAPI) -> Iterator[TestClient]:
    with TestClient(application) as test_client:
        yield test_client
