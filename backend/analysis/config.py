# analysis/config.py
from flask.json.provider import DefaultJSONProvider
from ezdxf.math import Vec2

CONFIG = {
    'WALL_THICKNESS_MIN': 0.08,
    'WALL_THICKNESS_MAX': 0.60,
    'MERGE_GAP': 0.10,
    'SNAP_TOLERANCE': 0.20,
    'WALL_HEIGHT': 3.0,
    'LINTEL_BEARING': 0.15,
    'DOOR_HEIGHT': 2.1,
    'WINDOW_HEIGHT': 1.5,
    'LAYERS': {
        'WALL': ['WALL'],
        'ROOM': ['ROOM_AREA', 'SITOUT', 'VARANDAH', 'PORCH'],
        'PLINTH': ['PLINTH_AREA'],
        'DOOR': ['DOOR'],
        'WINDOW': ['WINDOW'],
        'TEXT': ['TEXT', 'MTEXT', 'ROOM_AREA', 'SITOUT']
    }
}

class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, Vec2):
            return [round(obj.x, 3), round(obj.y, 3)]
        return super().default(obj)
