SERVICE     = metron-monitor
SYSTEMD     = $(HOME)/.config/systemd/user
PAYLOAD_DIR = $(HOME)/.local/share/bessel/monitor

.PHONY: install restart logs status uninstall report dump

install:
	mkdir -p $(PAYLOAD_DIR)
	cp main.py pyproject.toml $(PAYLOAD_DIR)/
	cp $(SERVICE).service $(SYSTEMD)/
	systemctl --user daemon-reload
	systemctl --user enable --now $(SERVICE)
	systemctl --user restart $(SERVICE)

restart:
	systemctl --user restart $(SERVICE)

logs:
	journalctl --user -u $(SERVICE) -f

status:
	systemctl --user status $(SERVICE)

uninstall:
	systemctl --user disable --now $(SERVICE)
	rm -f $(SYSTEMD)/$(SERVICE).service
	systemctl --user daemon-reload

report:
	uv run python main.py --report

dump:
	uv run python main.py --dump
