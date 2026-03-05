const Q = fn => {
            try {
                return fn?.()
            } catch {}
        };
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const postTask = (callback, options = {}) => scheduler.postTask(callback, {
            priority: "background",
            ...options
        });

        const waitNotBusy = () => new Promise(async (resolve) => {
            await sleep(1);
            try {
                await new Promise(r => postTask(r));
            } catch {}
            await sleep(1);
            try {
                await new Promise(r => requestIdleCallback(r));
            } catch {}
            await sleep(1);
            try {
                await new Promise(r => requestAnimationFrame(r));
            } catch {}
            await sleep(1);
            resolve(true);
  });

const newWebSocket = (url) => {
            const ws = new WebSocket(url);
            let rejected = false;
            let resolved = false;
            return new Promise((resolve, reject) => {
                ws.addEventListener('error', () => {
                    if (!resolved && !rejected) {
                        rejected = true;
                        reject();
                    }
                });
                ws.addEventListener('close', () => {
                    if (!resolved && !rejected) {
                        rejected = true;
                        reject();
                    }
                });
                ws.addEventListener('open', () => {
                    if (!resolved && !rejected) {
                        resolved = true;
                        resolve(ws);
                    }
                });
            });

        };

let ws;
        let connected;
        (async () => {
            while (true) {
                try {
                    if (!connected) {
                        ws = await newWebSocket('ws://localhost:3000/socket/');
                     //   setForceVisible(true);
                        ws.addEventListener('open', () => {
                            console.log('Connected to Relay!');
                            ws.send(JSON.stringify({
                                message: "Hello from Browser"
                            }));
                        });

                        ws.addEventListener('message', async (event) => {
                            if (event.data === 'pong') {
                                return console.log('pong');
                            }
                            console.log('Response from Relay:', event.data);
                            if (!event.data.startsWith('Relay received')) {
                                console.log('sendTextToGemini', event.data);
                                const request = JSON.parse(event.data);
                                const responseText = await sendTextToGemini(request.text);
                                const response = {
                                    responseText
                                };
                                response.requestId = request.requestId;
                                console.log({
                                    responseText
                                });
                                ws.send('/response/' + JSON.stringify(response));
                            }
                        });

                        connected = true;
                    }
                } catch (e) {
                    console.warn(e);
                    connected = false;
                }
                try {
                    ws.send('ping');
                } catch (e) {
                    console.warn(e);
                    connected = false;
                }
                await sleep(3000);
                await waitNotBusy();
                if (ws.readyState !== WebSocket.OPEN) {
                    connected = false;
                }
            }
        })();
