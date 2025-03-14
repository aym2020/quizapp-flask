from azure.cosmos import CosmosClient
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
import os
import json
from datetime import datetime

# Configuration
# Azure Key Vault details
KEY_VAULT_URL = "https://quizapp-keyvault.vault.azure.net/" 
COSMOS_SECRET_NAME = "CosmosDBConnectionString"
DB_NAME = "quizdb"
CONTAINERS = ["questions", "users", "certifications"]
BACKUP_ROOT = "backup"

# Authenticate to Azure Key Vault
credential = DefaultAzureCredential()
secret_client = SecretClient(vault_url=KEY_VAULT_URL, credential=credential)

# Retrieve the Cosmos DB connection string from Key Vault
try:
    COSMOS_CONN_STR = secret_client.get_secret(COSMOS_SECRET_NAME).value
    print("Cosmos DB connection string retrieved from Azure Key Vault.")
except Exception as e:
    raise ValueError(f"Failed to retrieve secret from Azure Key Vault: {e}")

def backup_container(container_client, backup_path):
    """Backup a single container to JSON files"""
    items = list(container_client.query_items(
        query="SELECT * FROM c",
        enable_cross_partition_query=True
    ))
    
    os.makedirs(backup_path, exist_ok=True)
    backup_file = os.path.join(backup_path, "data.json")
    
    with open(backup_file, 'w') as f:
        json.dump(items, f, indent=2)
    
    print(f"Backed up {len(items)} items to {backup_file}")

def main():
    # Create dated backup folder
    today = datetime.now().strftime("%Y-%m-%d")
    backup_dir = os.path.join(BACKUP_ROOT, f"backup_{today}")
    
    # Initialize Cosmos client
    client = CosmosClient.from_connection_string(COSMOS_CONN_STR)
    db = client.get_database_client(DB_NAME)
    
    # Backup each container
    for container_name in CONTAINERS:
        container = db.get_container_client(container_name)
        container_backup_path = os.path.join(backup_dir, container_name)
        backup_container(container, container_backup_path)
    
    print(f"\nBackup completed successfully to: {os.path.abspath(backup_dir)}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Backup failed: {str(e)}")
        raise