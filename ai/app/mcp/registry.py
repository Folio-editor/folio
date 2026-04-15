"""Phase 4 (Day 5) 예정.

Anthropic `messages.create(tools=[...])` 파라미터에 넘길 JSONSchema 목록과
툴 이름 → 파이썬 핸들러 매핑을 한 곳에 모아둔다.

예시:
    MCP_TOOLS = [
        {"name": "get_plan", "description": "...", "input_schema": {...}},
        {"name": "get_character", "description": "...", "input_schema": {...}},
        ...
    ]

    TOOL_HANDLERS = {
        "get_plan": tools.plan.get_plan,
        "get_character": tools.character.get_character,
        ...
    }
"""
