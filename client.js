/**
 * A robust WebSocket wrapper that handles automatic reconnection,
 * browser idle detection, and message handling.
 */
class ReconnectingWebSockets {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      pingInterval: 3000,
      onMessage: null,
      onConnect: null,
      ...options
    };

    this.isConnected = false;
    this.isStarted = false;
    this._sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    this._postTask = (callback, opts = {}) => {
      if (typeof scheduler !== 'undefined' && scheduler.postTask) {
        return scheduler.postTask(callback, {
          priority: "background",
          ...opts
        });
      }
      return setTimeout(callback, 0);
    };
  }

  /**
   * Waits for the browser to be idle before proceeding
   */
  async waitNotBusy() {
    await this._sleep(1);
    try {
      await new Promise(r => this._postTask(r));
    } catch {}
    await this._sleep(1);
    try {
      await new Promise(r => requestIdleCallback(r, {
        timeout: 2000
      }));
    } catch {}
    await this._sleep(1);
    try {
      await new Promise(r => requestAnimationFrame(r));
    } catch {}
    await this._sleep(1);
    return true;
  }

  /**
   * Internal method to create a single connection attempt
   */
  async connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      let handled = false;

      const cleanup = () => {
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
        socket.removeEventListener('close', onClose);
      };

      const onOpen = () => {
        if (!handled) {
          handled = true;
          resolve(socket);
        }
      };

      const onError = () => {
        if (!handled) {
          handled = true;
          reject(new Error('Connection error'));
        }
      };

      const onClose = () => {
        if (!handled) {
          handled = true;
          reject(new Error('Connection closed during handshake'));
        }
      };

      socket.addEventListener('open', onOpen);
      socket.addEventListener('error', onError);
      socket.addEventListener('close', onClose);
    });
  }

  /**
   * Main loop to maintain connection
   */
  async start() {
    if (this.isStarted) return;
    this.isStarted = true;
    let resolveSocket;
    this.waitingSocket = new Promise(resolve => {
      resolveSocket = resolve;
    });
    while (this.isStarted) {
      try {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.isConnected = false;
          console.log(`Attempting connection to ${this.url}...`);

          this.ws = await this._connect();
          this._setupEventListeners();
          this.isConnected = true;

          if (this.options.onConnect) {
            this.options.onConnect(this.ws);
          }

          resolveSocket(this.ws);
        }

        // Heartbeat
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          resolveSocket(this.ws);
          this.ws.send('ping');
        }

      } catch (e) {
        console.warn('Socket Loop Warning:', e.message);
        this.isConnected = false;
      }

      // Adaptive backoff/wait
      await this._sleep(this.options.pingInterval);
      await this.waitNotBusy();

      // Final sanity check for next loop iteration
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        this.isConnected = false;
      }
    }
  }

  async socket() {
    this.start();
    do {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        return this.ws;
      } else {
        await this.waitingSocket;
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
          return this.ws;
        }
      }
      await this._sleep(this.options.pingInterval / 10);
      await this.waitNotBusy();
    } while (this.isStarted)
    throw new Error('socket not available');
  }

  _setupEventListeners() {
    this.ws.addEventListener('message', async (event) => {
      if (event.data === 'pong') {
        return;
      }
      if (this.options.onMessage) {
        this.options.onMessage(event.data, this.ws);
      }
    });

    this.ws.addEventListener('close', () => {
      this.isConnected = false;
    });

    this.ws.addEventListener('error', () => {
      this.isConnected = false;
    });
  }

  async send(data) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      await (this.socket()).send(typeof data === 'string' ? data : JSON.stringify(data));
    } else {
      console.error('Cannot send: WebSocket is not connected');
    }
  }

  stop() {
    this.isStarted = false;
    if (this.ws) {
      this.ws.close();
    }
  }
}

// --- Example Usage ---

/*
const relay = new ReconnectingWebSockets('ws://localhost:3000/socket/', {
    onConnect: (ws) => {
        console.log('Connected to Relay!');
        ws.send(JSON.stringify({ message: "Hello from Browser" }));
    },
    onMessage: async (data, ws) => {
        console.log('Response from Relay:', data);
        
        if (!data.startsWith('Relay received')) {
            try {
                const request = JSON.parse(data);
                // Assuming sendTextToGemini is defined globally
                const responseText = await sendTextToGemini(request.text);
                
                const response = {
                    responseText,
                    requestId: request.requestId
                };
                
                ws.send('/response/' + JSON.stringify(response));
            } catch (e) {
                console.error("Failed to process message:", e);
            }
        }
    }
});

relay.start();
*/
