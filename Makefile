.PHONY: dev flush-redis

clients:
	chmod +x scripts/generate_clients.sh && scripts/generate_clients.sh
