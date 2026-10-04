.PHONY: clients ios-deploy ios-deploy-prod

clients:
	chmod +x scripts/generate_clients.sh && scripts/generate_clients.sh

ios-deploy:
	apps/ios/scripts/deploy.sh

ios-deploy-prod:
	CONFIGS=Release apps/ios/scripts/deploy.sh
