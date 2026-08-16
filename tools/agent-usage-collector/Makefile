SERVICE    = agent-usage-collector
SYSTEMD    = $(HOME)/.config/systemd/user
CONFIG_DIR = $(HOME)/.config/bessel
ENV_FILE   = $(CONFIG_DIR)/agent-usage-collector.env

.PHONY: install restart logs status uninstall run dry-run

install:
	mkdir -p $(CONFIG_DIR)
	test -f $(ENV_FILE) || cp .env.example $(ENV_FILE)
	cp $(SERVICE).service $(SERVICE).timer $(SYSTEMD)/
	systemctl --user daemon-reload
	systemctl --user enable --now $(SERVICE).timer
	@echo "Fill in $(ENV_FILE) if you haven't already, then: make run"

restart:
	systemctl --user restart $(SERVICE).timer

logs:
	journalctl --user -u $(SERVICE) -f

status:
	systemctl --user status $(SERVICE).timer

uninstall:
	systemctl --user disable --now $(SERVICE).timer
	rm -f $(SYSTEMD)/$(SERVICE).service $(SYSTEMD)/$(SERVICE).timer
	systemctl --user daemon-reload

run:
	systemctl --user start $(SERVICE).service

dry-run:
	uv run collect_agent_usage.py --dry-run
