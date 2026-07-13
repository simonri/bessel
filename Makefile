.PHONY: dev flush-redis ios-deploy

clients:
	chmod +x scripts/generate_clients.sh && scripts/generate_clients.sh

ios-deploy:
	apps/ios/scripts/export-ipa.sh
