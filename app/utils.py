from azure.cosmos import CosmosClient
from azure.cosmos import CosmosClient
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential


# Azure Key Vault details
KEY_VAULT_URL = "https://quizapp-keyvault.vault.azure.net/" 
COSMOS_SECRET_NAME = "CosmosDBConnectionString"

# Authenticate to Azure Key Vault
credential = DefaultAzureCredential()
secret_client = SecretClient(vault_url=KEY_VAULT_URL, credential=credential)

# Retrieve the Cosmos DB connection string from Key Vault
try:
    COSMOS_DB_CONN = secret_client.get_secret(COSMOS_SECRET_NAME).value
    print("Cosmos DB connection string retrieved from Azure Key Vault.")
except Exception as e:
    raise ValueError(f"Failed to retrieve secret from Azure Key Vault: {e}")

# Cosmos DB Connection
client = CosmosClient.from_connection_string(COSMOS_DB_CONN)
db = client.get_database_client("quizdb")
container = db.get_container_client("questions")

def soft_delete_question(question_id):
    """Marks a question as deleted and sets a TTL for automatic removal."""
    
    question = list(container.query_items(
        query="SELECT * FROM c WHERE c.id = @id",
        parameters=[{"name": "@id", "value": question_id}],
        enable_cross_partition_query=True
    ))
    
    if not question:
        print(f"❌ Question with ID {question_id} not found.")
        return
    
    question = question[0]  # Get the first result
    
    # Set "deleted" to True and add TTL (ensure TTL is enabled in Cosmos DB)
    question["deleted"] = True
    question["ttl"] = 3600  # Auto-delete after 1 hour (adjust as needed)
    
    container.replace_item(item=question, body=question)
    
    print(f"✅ Question {question_id} marked as deleted and will be removed in {question['ttl']} seconds.")
