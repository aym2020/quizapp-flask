import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app  # Now it should work
from app.utils import soft_delete_question

uuid_question = 'b0e20af5-33a5-4c11-9647-bec80d0d8ea8'

soft_delete_question(uuid_question)
