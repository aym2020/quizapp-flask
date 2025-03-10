# migration.py
import uuid
from azure.cosmos import CosmosClient
from flask import Flask, render_template, request, jsonify, redirect, url_for, make_response
from azure.cosmos import CosmosClient
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
from app import app
from flask_bcrypt import Bcrypt
from flask import session
from werkzeug.utils import secure_filename
from openai import OpenAI
from io import BytesIO
from datetime import datetime
import json 
import random
import os
import re
from PIL import Image
import pytesseract
import io
import base64
import logging

MAIN_HOME_PAGE = "home.html"
MAIN_QUIZ_PAGE = "quiz.html"

# Azure Key Vault details
KEY_VAULT_URL = "https://quizapp-keyvault.vault.azure.net/" 
COSMOS_SECRET_NAME = "CosmosDBConnectionString"
FLASK_SECRET_NAME = "FlaskSecretKey"
OPEN_API_NAME = "OpenApiKey"

# Authenticate to Azure Key Vault
credential = DefaultAzureCredential()
secret_client = SecretClient(vault_url=KEY_VAULT_URL, credential=credential)

# Flask key
app.secret_key = secret_client.get_secret(FLASK_SECRET_NAME).value
OPEN_API_KEY = secret_client.get_secret(OPEN_API_NAME).value

# OpenAI Api
openai_client = OpenAI(api_key=OPEN_API_KEY)

# Retrieve the Cosmos DB connection string from Key Vault
try:
    COSMOS_DB_CONN = secret_client.get_secret(COSMOS_SECRET_NAME).value
    print("Cosmos DB connection string retrieved from Azure Key Vault.")
except Exception as e:
    raise ValueError(f"Failed to retrieve secret from Azure Key Vault: {e}")

# Initialize the Cosmos DB client
cosmos_client = CosmosClient.from_connection_string(COSMOS_DB_CONN)

# Get the database and container
db = cosmos_client.get_database_client("quizdb")
questions_container = db.get_container_client("questions")
users_container = db.get_container_client("users")
certif_container = db.get_container_client("certifications")




def migrate_questions():
    client = CosmosClient.from_connection_string(COSMOS_DB_CONN)
    db = client.get_database_client("quizdb")
    container = db.get_container_client("questions")

    # Get all questions
    questions = list(container.query_items(
        query="SELECT * FROM c",
        enable_cross_partition_query=True
    ))

    for question in questions:
        if 'exam_topic_id' in question:
            continue
            
        original_id = question['id']
        partition_key = question['certifcode']  # Adaptez selon votre clé de partition
        
        # Créez un nouveau document avec le nouvel ID
        new_question = question.copy()
        new_question['exam_topic_id'] = original_id
        new_question['id'] = str(uuid.uuid4())
        
        # Créez le nouveau document
        container.create_item(new_question)
        
        # Supprimez l'ancien document
        container.delete_item(item=original_id, partition_key=partition_key)
        
        print(f"Migrated {original_id} to {new_question['id']}")

if __name__ == "__main__":
    migrate_questions()