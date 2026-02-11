#!/bin/bash
# Worker management script for dramatiq

PID_FILE="/tmp/dramatiq-worker.pid"
WORKER_PATTERN="dramatiq.*src.api.worker"

case "$1" in
  start)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "Worker is already running (PID: $PID)"
        exit 1
      else
        echo "Removing stale PID file"
        rm -f "$PID_FILE"
      fi
    fi

    echo "Starting worker..."
    dramatiq -p 1 -t 1 --queues high_priority medium_priority low_priority --pid-file "$PID_FILE" -f src.api.worker.scheduler:start src.api.worker.run
    ;;

  stop)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      echo "Stopping worker (PID: $PID)..."
      kill -TERM "$PID" 2>/dev/null

      # Wait up to 30 seconds for graceful shutdown
      for i in {1..30}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
          echo "Worker stopped gracefully"
          rm -f "$PID_FILE"
          exit 0
        fi
        sleep 1
      done

      echo "Worker didn't stop gracefully, force killing..."
      kill -9 "$PID" 2>/dev/null
      rm -f "$PID_FILE"
    else
      echo "No PID file found"
    fi

    # Clean up any remaining worker processes
    echo "Cleaning up any remaining worker processes..."
    pkill -TERM -f "$WORKER_PATTERN"
    sleep 2
    pkill -9 -f "$WORKER_PATTERN" 2>/dev/null
    ;;

  restart)
    $0 stop
    sleep 2
    $0 start
    ;;

  status)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "Worker is running (PID: $PID)"
        echo ""
        echo "Worker processes:"
        ps aux | grep -E "$WORKER_PATTERN" | grep -v grep
      else
        echo "Worker PID file exists but process is not running"
      fi
    else
      echo "Worker is not running (no PID file)"
    fi

    # Check for orphaned processes
    ORPHANED=$(pgrep -f "$WORKER_PATTERN" | wc -l)
    if [ "$ORPHANED" -gt 0 ]; then
      echo ""
      echo "Warning: Found $ORPHANED worker process(es):"
      ps aux | grep -E "$WORKER_PATTERN" | grep -v grep
    fi
    ;;

  clean)
    echo "Force killing all worker processes..."
    pkill -9 -f "$WORKER_PATTERN"
    rm -f "$PID_FILE"
    echo "Cleanup complete"
    ;;

  *)
    echo "Usage: $0 {start|stop|restart|status|clean}"
    echo ""
    echo "Commands:"
    echo "  start   - Start the worker"
    echo "  stop    - Stop the worker gracefully"
    echo "  restart - Restart the worker"
    echo "  status  - Check worker status"
    echo "  clean   - Force kill all workers and clean up"
    exit 1
    ;;
esac
