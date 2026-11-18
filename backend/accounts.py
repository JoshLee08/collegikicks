"""Supabase verifies bearer identity before administrative account removal."""
import json
import os
from urllib.request import Request, urlopen
from urllib.error import URLError
from fastapi import HTTPException


def delete_account(authorization: str):
    origin = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not origin or not key:
        raise HTTPException(503, 'Account deletion is not configured')
    if not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Sign in required')
    try:
        request = Request(origin + '/auth/v1/user', headers={'apikey': key, 'Authorization': authorization})
        with urlopen(request, timeout=10) as response:
            identity = json.load(response)
        user_id = identity.get('id', '')
        from uuid import UUID
        user_id = str(UUID(user_id))
    except (URLError, ValueError, KeyError):
        raise HTTPException(401, 'Invalid or expired session')
    try:
        request = Request(origin + '/auth/v1/admin/users/' + user_id, method='DELETE', headers={'apikey': key, 'Authorization': 'Bearer ' + key})
        with urlopen(request, timeout=10):
            pass
    except URLError:
        raise HTTPException(502, 'Deletion failed; retry later')
    return {'deleted': True}
