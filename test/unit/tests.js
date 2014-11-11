/* jshint expr: true */
// phantomjs has problems
// https://github.com/cjohansen/Sinon.JS/issues/319
  if (navigator.userAgent.indexOf('PhantomJS') !== -1 ||
      navigator.userAgent.indexOf('Iceweasel') !== -1) {
    window.ProgressEvent = function(type, params) {
      params = params || {};

      this.lengthComputable = params.lengthComputable || false;
      this.loaded = params.loaded || 0;
      this.total = params.total || 0;
    };
  }

// Some tests depend on killing JSON, but we need it in the fake server.
var MYJSON = JSON;

describe('Unit test of json rpc client', function() {

  // Setup fake xhr server
  var server;
  var savedWebSocket;
  beforeEach(function() {
    server = sinon.fakeServer.create();
    savedWebSocket = window.WebSocket; // Some test override the ws

    // Autorespond after 10ms!
    server.autoRespond = true;

    // Setup some standard responses that can be reused throuout the tests
    server.respondWith('GET',  '/giveme404', [404, {}, '']);
    server.respondWith('POST', '/giveme404', [404, {}, '']);
    server.respondWith('POST', '/giveme500', [500, {}, '']);

    // Helper to create right json-rpc responce
    var createResponse = function(rpc) {
      var result  = {jsonrpc: '2.0'};

      if (typeof rpc.id !== 'undefined') {
        result.id = rpc.id;
      }

      if (rpc.method === 'error') {
        // I like an error please
        result.error = {code: -32600 , message: 'Your half hour is up'};
      }
      else {
        // Send id so its easy to test response.
        result.result = {id: rpc.id, msg: 'foobar', xhr: true};
      }
      return result;
    };

    var handleRpc = function(req, code) {
      var rpc = MYJSON.parse(req.requestBody);
      // rpc can be an array on batched requests
      var result;
      if (Object.prototype.toString.call(rpc) === '[object Array]') {
        result = [];
        for (var i = 0; i < rpc.length; i++) {
          result.push(createResponse(rpc[i]));
        }
      }
      else {
        result = createResponse(rpc);
      }
      req.respond(code, {'Content-Type': 'text/json'}, MYJSON.stringify(result));
    };

    server.respondWith('POST', '/rpc-500', function(req) {
      handleRpc(req, 500);
    });

    // Some good responses
    server.respondWith('POST', '/rpc', function(req) {
      handleRpc(req, 200);
    });

    server.respondWith('POST', '/rpc-jumbled', function(req) {
      var rpc = MYJSON.parse(req.requestBody);

      // rpc can be an array on batched requests
      var result;
      if (Object.prototype.toString.call(rpc) === '[object Array]') {
        result = [];
        for (var i = 0; i < rpc.length; i++) {
          result.push(createResponse(rpc[i]));
        }

        // Mix it up a bit
        var tmp = result[result.length - 1];
        result[result.length - 1] = result[0];
        result[0] = tmp;
      }
      else {
        result = createResponse(rpc);
      }
      req.respond(200, {'Content-Type': 'text/json'}, MYJSON.stringify(result));
    });

    server.respondWith('POST', '/echoheaders', function(req) {
      var rpc = MYJSON.parse(req.requestBody);
      var result = {
        id:       rpc.id,
        result:   req.requestHeaders,
        jsonrpc: '2.0'
      };

      req.respond(200, {'Content-Type': 'text/json'}, MYJSON.stringify(result));
    });

  });

  afterEach(function() {
    server.restore();
    window.WebSocket = savedWebSocket;
  });

  it('should be an obect', function() {
    var test = new $.JsonRpcClient({ajaxUrl: '/giveme404'});
    expect(test).to.be.a('object');
  });

  it('should call error callback on a bad backend, with 404', function(done) {
    // this.timeout(500);
    // Setup a test client with a bad backend
    var client = new $.JsonRpcClient({ajaxUrl: '/giveme404'});

    var success = sinon.stub().throws('Success should not be called!');

    client.call('foo', [], success, function() {
      done();
    });

  });

  it('should call error callback on a bad backend, with 500', function(done) {
    // Setup a test client with a bad backend
    var client = new $.JsonRpcClient({ajaxUrl: '/giveme404'});

    var success = sinon.stub().throws('Success should not be called!');

    client.call('foo', [], success, function() {
      done();
    });

  });

  it(
    'should call batch error callback on non existing backend, not individual error callbacks',
    function(done) {
      this.timeout(500); // If no callback is called time out

      var client = new $.JsonRpcClient({ajaxUrl: '/giveme404'});
      var dontCall = sinon.stub().throws('Should not be called');

      client.batch(function(batch) {
        batch.call('foo', [], dontCall, dontCall);
        batch.call('bar', [], dontCall, dontCall);
      }, dontCall, function() {
        // Called! nice :-)
        done();
      });
    }
  );

  it('should handle empty batch without throwing an error', function() {
    var client = new $.JsonRpcClient({ajaxUrl: '/rpc-jumbled'});
    client.batch(function() {});
  });

  it('should give the right success callback when doing batched XHR requests', function(done) {
    var client = new $.JsonRpcClient({ajaxUrl: '/rpc-jumbled'});

    var dontCall = sinon.stub().throws();

    var cb1 = sinon.spy();
    var cb2 = sinon.spy();
    var cb3 = sinon.spy();

    client.batch(function(batch) {
      batch.call('foo', [], cb1, dontCall);
      batch.call('error', [], dontCall, cb2);
      batch.call('foo', [], cb3, dontCall);
    }, function() {
      // All done
      expect(cb1.calledOnce).to.be.true;
      expect(cb2.calledOnce).to.be.true;
      expect(cb3.calledOnce).to.be.true;

      expect(cb1.getCall(0).args[0].id).to.be.equal(1);
      expect(cb2.getCall(0).args[0].message).to.be.equal('Your half hour is up');
      expect(cb3.getCall(0).args[0].id).to.be.equal(3);
      done();
    }, dontCall);

  });

  it('should handle a doing a call without any handlers', function() {
    var client = new $.JsonRpcClient({ajaxUrl: '/rpc'});
    client.call('foo', []);
  });

  it('should handle a JSON-RPC response and call the success handler', function(done) {
    var client = new $.JsonRpcClient({ajaxUrl: '/rpc'});
    client.call('foo', [], function(result) {
      expect(result.msg).to.be.equal('foobar');
      done();
    }, sinon.stub().throws());

  });

  it(
    'should handle a JSON-RPC response and call the error handler on JSON-RPC error',
    function(done) {
      var client = new $.JsonRpcClient({ajaxUrl: '/rpc'});
      client.call('error', [], sinon.stub().throws(), function(error) {
        expect(error.message).to.be.equal('Your half hour is up');
        done();
      }, sinon.stub().throws());
    }
  );

  it(
    'should handle a JSON-RPC response and call the error handler on JSON-RPC error, 500 version',
    function(done) {
      var client = new $.JsonRpcClient({ajaxUrl: '/rpc-500'});
      client.call('error', [], sinon.stub().throws(), function(error) {
        expect(error.message).to.be.equal('Your half hour is up');
        done();
      }, sinon.stub().throws());
    }
  );

  // TODO: this doesn't test much
  it('should handle a JSON-RPC not fail when doing notify', function() {
    var client = new $.JsonRpcClient({ajaxUrl: '/rpc'});
    client.notify('foo', []);
  });

  it('should use XHR request when browser does not support WebSocket', function(done) {
    var client = new $.JsonRpcClient({ajaxUrl: '/rpc', getSocket: function() { return null; }});
    client.call('foo', [], function(result) {
      expect(result.xhr).to.be.true;
      done();
    }, sinon.stub().throws());
  });

  it(
    'should fail when browser does not support WebSocket anf HTTP endpoint is defined',
    function() {
      var client = new $.JsonRpcClient({getSocket: function() { return null; }});
      expect(function() { client.call('foo', []); }).to.throw();
      expect(function() { client.notify('foo', []); }).to.throw();
      expect(function() { client.batch(function(b) {
        b.notify('foo', []);
      }); }).to.throw();
    }
  );

  if (window.WebSocket) {
    it('should use WebSockets when available', function(done) {
      var dontCall = sinon.stub().throws();

      // Echo service doesn't reply with a proper JSON-RPC so we use the onmessage handler to check
      // for success
      var client = new $.JsonRpcClient({
        socketUrl: 'ws://echo.websocket.org/',
        onmessage: function(result) {
          expect(result.data)
            .to.be.equal('{"jsonrpc":"2.0","method":"foobar","params":[],"id":1}');
          done();
        }
      });

      client.call('foobar', [], function(data) {

      }, dontCall);
    });

    if (!window.isJsTestDriver) {
      it('should use WebSockets when available, fake response', function(done) {

        var dontCall = sinon.stub().throws();

        // Echo service doesn't reply with a proper JSON-RPC so we use the onmessage handler to
        // check for success.
        var client = new $.JsonRpcClient({
          socketUrl: 'ws://echo.websocket.org/'
        });

        client.call('foobar', [], function(data) {
          expect(data).to.be.equal('baz');
          done();
        }, dontCall);

        // Send the response via the client internal socket, to get the echo-server to send it
        // back to us.
        var oldOnopen = client._wsSocket.onopen;
        if (typeof oldOnopen === 'function') {
          client._wsSocket.onopen = function(event) {
            oldOnopen(event); // Chain in the already added onopen handler.
            client._wsSocket.send(MYJSON.stringify({
              jsonrpc: '2.0',
              result:  'baz',
              id:      client._currentId - 1 // Match the last requests id
            }));
          };
        }
        else {
          console.log('Bad browser (old firefox?), skipping tests');
          done();
        }

      });
    }
  }
  else {
    console.log('No websocket support, skipping tests');
  }

  it('shold handle errors from WebSocket', function(done) {

    // Mock a websocket-like object and patch it in!
    // cleanup is done in beforeEach and afterEach
    window.WebSocket = function(url) {
      this.onopen     = null;
      this.onmessage  = null;
      this.onclose    = null;
      this.onerror    = null;

      this.send = function(data) {
        // Make all send requests cause an error.
        if (typeof this.onerror === 'function') {
          this.onerror('Sending of data failed!');
        }
      };
    };

    var client = new $.JsonRpcClient({
      socketUrl: 'ws://echo.websocket.org/',
      onerror: function(err) {
        expect(err).to.be.equal('Sending of data failed!');
        done();
      }
    });

    // Send a request with client.  This should trigger the socket onerror_cb.
    client.notify('foo', []);
  });

  // Issue #14
  it(
    'should send along messages that fail JSON parsing to fallback message handler',
    function(done) {
      var dontCall = sinon.stub().throws();

      // Mock a websocket-like object and patch it in!
      window.WebSocket = function() {
        this.onopen    = null;
        this.onmessage = null;
        this.onclose   = null;
        this.onerror   = null;
        this.readyState = 1;

        this.send = function() {
          // Response is a fake json response
          this.onmessage({data: 'this is not JSON'});
        };
      };

      var client = new $.JsonRpcClient({
        socketUrl: 'ws://localhost/',
        onmessage: function(msg) {
          expect(msg.data).to.be.equal('this is not JSON');
          done();
        },
        onerror: dontCall
      });

      // Send a request with client.  This should trigger the socket onmessage_cb.
      client.call('foo', [], dontCall, dontCall);

    }
  );

  // Issue #14
  it('should not consume errors in callbacks when using WebSockets', function(done) {
    // Mock a websocket-like object and patch it in!
    window.WebSocket = function(url) {
      this.onopen    = null;
      this.onmessage = null;
      this.onclose   = null;
      this.onerror   = null;
      this.readyState = 1;

      this.send = function(data) {
        var that = this;
        setTimeout(function() {
          // Fake a json response
          that.onmessage({
            data: MYJSON.stringify({
              jsonrpc: '2.0',
              id:      MYJSON.parse(data).id,
              result:  'foobar'
            })
          });
        }, 0);
      };
    };
    var dontCall = sinon.stub().throws();
    var client = new $.JsonRpcClient({
      socketUrl: 'ws://localhost/',
      onmessage: dontCall,
      onerror: dontCall,
    });

    window.onerror = function(msg) {
      // Chromium prefixes with 'Uncaught Error:', Firefox with 'Error'
      expect(msg.split(':')[1]).to.equal(' Dude, not again');
      window.onerror = null;
      done();
    };

    client.call('foo', [], function() {
      // Ooops we have a bug in our callback!
      throw new Error('Dude, not again');
    }, dontCall);

  });

  // Issue #11
  it('should queue calls until ws opens', function() {
    // Mock a websocket-like object and patch it in!
    var send = sinon.spy();
    window.WebSocket = function() {
      this.onopen    = null;
      this.onmessage = null;
      this.onclose   = null;
      this.onerror   = null;
      this.readyState = 0;

      this._open = function() {
        this.readyState = 1;
        this.onopen && this.onopen();
      };

      this.send = send;
    };

    var client = new $.JsonRpcClient({
      socketUrl: 'ws://localhost/',
      onmessage: dontCall,
      onerror: dontCall,
    });

    var noop = function() {};
    var dontCall = sinon.stub().throws();

    // Send two requests, then "open" the websocket
    client.call('foo', [], noop, dontCall);
    client.call('foo', [], noop, dontCall);

    // Open socket *after*, both should be queued
    client._wsSocket._open();

    expect(send.calledTwice).to.be.true;

  });

  // Issue #11
  it('should queue calls until ws opens, even with batching', function(done) {
    // Mock a websocket-like object and patch it in!
    window.WebSocket = function() {
      this.onopen    = null;
      this.onmessage = null;
      this.onclose   = null;
      this.onerror   = null;
      this.readyState = 0;

      this._open = function() {
        this.readyState = 1;
        this.onopen && this.onopen();
      };
      var that = this;
      this.send = function(data) {
        setTimeout(function() {
          // Fake a json response
          that.onmessage({
            data: MYJSON.stringify({
              jsonrpc: '2.0',
              id:      MYJSON.parse(data).id,
              result:  'foobar'
            })
          });
        }, 0);
      };
    };

    var dontCall = sinon.stub().throws();
    var client = new $.JsonRpcClient({
      socketUrl: 'ws://localhost/',
      onmessage: dontCall,
      onerror: dontCall,
    });

    // Batch a request before ws is opened
    var success = sinon.spy();
    client.batch(function(batch) {
      // Send two requests, then "open" the websocket
      batch.call('foo', [], success, dontCall);
      batch.call('foo', [], success, dontCall);
      batch.call('foo', [], success, dontCall);
    }, function(results) {
      expect(results.length).to.equal(3);
      expect(success.calledThrice).to.be.true;
      done();
    }, dontCall);

    // Finally open the socket.
    client._wsSocket._open();

  });

  // Issue #21
  it('should pass extra headers to the $.ajax', function(done) {

    var client = new $.JsonRpcClient({
      ajaxUrl: '/echoheaders',
      headers: {'Roadkill-Quality': 'high'}
    });
    var failure = sinon.stub().throws('Failure should not be called!');

    client.call('foo', [], function(headers) {
      expect(headers['Roadkill-Quality']).to.be.equal('high');
      done();
    }, failure);

  });

  // Issue #20
  it('should return a jQuery Promise on "call"', function() {
    var client = new $.JsonRpcClient({ajaxUrl: '/giveme404'});

    var promise = client.call('foo', []);
    expect(promise).to.be.an('object');
    expect(promise.then).to.be.a('function');

  });

  // Issue #20
  it('should return null on "call" when WebSockets are used', function() {

    window.WebSocket = function() {
      this.onopen     = null;
      this.onmessage  = null;
      this.onclose    = null;
      this.onerror    = null;
      this.send = function() {};
    };

    var client = new $.JsonRpcClient({
      socketUrl: 'ws://localhost/'
    });

    var notPromise = client.call('foo', []);
    expect(notPromise).to.equal(null);
  });

  describe('with jquery.json', function() {

    it('should use $.toJSON and $.parseJSON if JSON is not present', function() {

      $.toJSON    = function() {};
      $.parseJSON = function() {};

      // Kill JSON
      window.JSON = null;

      var client = new $.JsonRpcClient({ajaxUrl: '/rpc'});

      window.JSON = MYJSON; // Restore again, since chaijs depends on it!

      expect(client.JSON.stringify).to.be.equal($.toJSON);
      expect(client.JSON.parse).to.be.equal($.parseJSON);

    });

  });

  it('should timeout a websocket call that does not get a response', function(done) {

    window.WebSocket = function() {
      this.onopen     = null;
      this.onmessage  = null;
      this.onclose    = null;
      this.onerror    = null;
      this.send = function() {};
    };

    var client = new $.JsonRpcClient({
      socketUrl: 'ws://localhost/',
      timeout: 10
    });

    var dontCall = sinon.stub().throws();
    var fail = sinon.stub();

    client.call('foo', [], dontCall, fail);
    expect(fail).to.not.have.been.called;

    setTimeout(function() {
      expect(fail).to.have.been.calledWith({
        code: -32603,
        message: 'Call timed out.'
      });
      done();
    }, 15);
  });

  it('should clear any timeout when we get a response', function(done) {

    window.WebSocket = function() {
      this.onopen     = null;
      this.onmessage  = null;
      this.onclose    = null;
      this.onerror    = null;
      this.send = function(data) {
        var that = this;

        setTimeout(function() {
          // Fake a json response
          that.onmessage({
            data: MYJSON.stringify({
              jsonrpc: '2.0',
              id:      MYJSON.parse(data).id,
              result:  'foobar'
            })
          });
        }, 0);
      };
    };

    var client = new $.JsonRpcClient({
      socketUrl: 'ws://localhost/',
      timeout: 70
    });

    var dontCall = sinon.stub().throws();
    var success = sinon.spy();

    client.call('foo', [], success, dontCall);
    //expect(success).to.not.have.been.called;

    setTimeout(function() {
      expect(success).to.have.been.called;
      done();
    }, 100);

  });

});
