.PHONY: clients check-clients ios-deploy ios-deploy-prod

clients:
	scripts/generate_clients.sh

check-clients:
	scripts/check_clients.sh

ios-deploy:
	apps/ios/scripts/deploy.sh

ios-deploy-prod:
	CONFIGS=Release apps/ios/scripts/deploy.sh
