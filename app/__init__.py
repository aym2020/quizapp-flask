# app/__init__.py
from flask import Flask

app = Flask(__name__)
from app.routes import *