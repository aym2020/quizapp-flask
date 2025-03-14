from azure.cosmos import CosmosClient
import os

# Source and Target Connection Strings (get these from Azure Portal)
SOURCE_CONN_STR = ""
TARGET_CONN_STR = ""

# Initialize clients
source_client = CosmosClient.from_connection_string(SOURCE_CONN_STR)
target_client = CosmosClient.from_connection_string(TARGET_CONN_STR)

# Database and container names
DB_NAME = "quizdb"
CONTAINERS = ["certifications", "users", "questions"]
PARTITION_KEY_PATHS = {
    "certifications": "/certifcode",  # Example
    "users": "/id",
    "questions": "/certifcode"
}

def migrate_container(container_name):
    print(f"\nMigrating {container_name}...")
    
    # Get containers
    source_container = source_client.get_database_client(DB_NAME).get_container_client(container_name)
    target_container = target_client.get_database_client(DB_NAME).get_container_client(container_name)

    # Delete existing items in target (if needed)
    partition_key_path = PARTITION_KEY_PATHS[container_name]
    for item in target_container.query_items("SELECT * FROM c", enable_cross_partition_query=True):
        partition_key_value = item[partition_key_path.strip('/')]
        target_container.delete_item(item['id'], partition_key=partition_key_value)

    # Copy items
    item_count = 0
    for item in source_container.query_items("SELECT * FROM c", enable_cross_partition_query=True):
        target_container.upsert_item(item)
        item_count += 1
        if item_count % 100 == 0:
            print(f"Copied {item_count} items...")
    
    print(f"Completed {container_name}: {item_count} items migrated")

"""
if __name__ == "__main__":
    for container in CONTAINERS:
        migrate_container(container)
    print("\nMigration complete!")
"""