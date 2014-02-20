/* jshint expr: true */
// phantomjs has problems
// https://github.com/cjohansen/Sinon.JS/issues/319
  if (navigator.userAgent.indexOf('PhantomJS') !== -1 ||
      navigator.userAgent.indexOf('Iceweasel') !== -1) {
    window.ProgressEvent = function (type, params) {
      params = params || {};

      this.lengthComputable = params.lengthComputable || false;
      this.loaded = params.loaded || 0;
      this.total = params.total || 0;
    };
  }


describe('Unit test of json rpc client', function() {

  // patch $.toJSON and $.parseJSON
  if (!$.toJSON && window.JSON) {
    $.toJSON = JSON.stringify;
  }

  if (!$.parseJSON && window.JSON) {
    $.parseJSON = JSON.parse;
  }

  // setup fake xhr server
  var server, savedWebSocket;
  beforeEach(function() {
    server = sinon.fakeServer.create();
    savedWebSocket = window.WebSocket; // some test override the ws

    // autorespond after 10ms!
    server.autoRespond = true;

    // setup some standard responses that can be reused throuout the tests
    server.respondWith('GET', '/giveme404', [404, {}, ""]);
    server.respondWith('POST', '/giveme404', [404, {}, ""]);


    // helper to create right json-rpc responce
    var createResponse = function(rpc) {
      var result  = { jsonrpc: "2.0" };

      if (typeof rpc.id !== 'undefined') {
        result.id = rpc.id;
      }

      if (rpc.method === "error") {
        // I like an error please
        result.error = { code: -32600 , message: "Your half hour is up" };
      }
      else {
        // Send id so its easy to test response.
        result.result = { id: rpc.id, msg: "foobar", xhr: true};
      }
      return result;
    };

    // some good responses
    server.respondWith('POST', '/rpc', function(req) {
      var rpc = JSON.parse(req.requestBody);
      // rpc can be an array on batched requests
      var result;
      if ( Object.prototype.toString.call(rpc) === "[object Array]") {
        result = [];
        for (var i=0; i<rpc.length; i++) {
          result.push(createResponse(rpc[i]));
        }
      }
      else {
        result = createResponse(rpc);
      }

      req.respond(200, { "Content-Type": "text/json"}, JSON.stringify(result));
    });


    server.respondWith('POST', '/rpc-jumbled', function(req) {
      var rpc = JSON.parse(req.requestBody);

      // rpc can be an array on batched requests
      var result;
      if ( Object.prototype.toString.call(rpc) === "[object Array]") {
        result = [];
        for (var i=0; i<rpc.length; i++) {
          result.push(createResponse(rpc[i]));
        }

        // mix it up a bit
        var tmp = result[result.length-1];
        result[result.length-1] = result[0];
        result[0] = tmp;



      }
      else {
        result = createResponse(rpc);
      }
      req.respond(200, { "Content-Type": "text/json"}, JSON.stringify(result));
    });


  });

  afterEach(function() {
    server.restore();
    window.WebSocket = savedWebSocket;
  });


  // testNew
  it('should be an obect', function() {
    var test = new $.JsonRpcClient({ ajaxUrl: '/giveme404' });
    expect(test).to.be.a('object');
  });


  // testBadBackend
  it('should call error callback on a bad backend', function(done) {
    // this.timeout(500);
    // Setup a test client with a bad backend
    var client = new $.JsonRpcClient({ ajaxUrl: '/giveme404' });

    var success = sinon.stub().throws('Success should not be called!');

    client.call('foo', [], success, function() {
      done();
    });

  });


  // testBatchErrorInHttp
  it('should call the batch error callback on a non existing backend, not the individual error callbacks', function(done) {
    this.timeout(500); // if no callback is called time out

    var client = new $.JsonRpcClient({ ajaxUrl: '/giveme404' });
    var dontCall = sinon.stub().throws('Should not be called');

    client.batch(function(batch) {
      batch.call('foo', [], dontCall, dontCall);
      batch.call('bar', [], dontCall, dontCall);
    }, dontCall, function() {
      // called! nice :-)
      done();
    });
  });

  // testBatcHttp
  it('should give the right success callback when doing batched XHR requests', function(done) {
    var client = new $.JsonRpcClient({ ajaxUrl: '/rpc-jumbled' });

    var dontCall = sinon.stub().throws();

    var cb1 = sinon.spy();
    var cb2 = sinon.spy();
    var cb3 = sinon.spy();

    client.batch(function(batch) {
      batch.call('foo', [], cb1, dontCall);
      batch.call('foo', [], cb2, dontCall);
      batch.call('foo', [], cb3, dontCall);
    }, function() {
      // all done
      expect(cb1.calledOnce).to.be.true;
      expect(cb2.calledOnce).to.be.true;
      expect(cb3.calledOnce).to.be.true;

      expect(cb1.getCall(0).args[0].id).to.be.equal(1);
      expect(cb2.getCall(0).args[0].id).to.be.equal(2);
      expect(cb3.getCall(0).args[0].id).to.be.equal(3);
      done();
    }, dontCall);


  });


  // testCall
  it('should handle a JSON-RPC response and call the success handler', function(done) {
    var client = new $.JsonRpcClient({ ajaxUrl: '/rpc' });
    client.call('foo', [], function(result) {
      expect(result.msg).to.be.equal('foobar');
      done();
    }, sinon.stub().throws());

  });


  // testNotify
  // TODO: this doesn't test much
  it('should handle a JSON-RPC not fail when doing notify', function() {
    var client = new $.JsonRpcClient({ ajaxUrl: '/rpc' });
    client.notify('foo', []);
  });

  // testNoWebSocket
  it('should use XHR request when browser does not support WebSocket', function(done) {
    var client = new $.JsonRpcClient({ ajaxUrl: '/rpc', getSocket: function() { return null; } });
    client.call('foo', [], function(result) {
      expect(result.xhr).to.be.true;
      done();
    }, sinon.stub().throws());
  });

  // testDefaultGetsocket
  if (window.WebSocket) {
    it('should use WebSockets when available', function(done) {
      var dontCall = sinon.stub().throws();

      // echo service doesn't reply with a proper JSON-RPC
      // so we use the onmessage handler to check for succe
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

    // FIXME: for unkown reason this tests hangs jstestdriver
    if (!window.isJsTestDriver) {
      it('should use WebSockets when available, fake response', function(done) {

        var dontCall = sinon.stub().throws();

        // echo service doesn't reply with a proper JSON-RPC
        // so we use the onmessage handler to check for succe
        var client = new $.JsonRpcClient({
          socketUrl: 'ws://echo.websocket.org/'
        });

        client.call('foobar', [], function(data) {
          expect(data).to.be.equal('baz');
          done();
        }, dontCall);


        // Send the response via the client internal socket, to get the echo-server to send it
        // back to us.
        var old_onopen = client._ws_socket.onopen;
        if (typeof old_onopen === 'function') {
          client._ws_socket.onopen = function(event) {
            old_onopen(event); // chain in the already added onopen handler.
            client._ws_socket.send($.toJSON({
              jsonrpc: '2.0',
              result: "baz",
              id: client._current_id - 1 // match the last requests id
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


  // testWebsocketOnError
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
          this.onerror("Sending of data failed!");
        }
      };
    };

    var client = new $.JsonRpcClient({
      socketUrl: 'ws://echo.websocket.org/',
      onerror: function(err) {
        expect(err).to.be.equal("Sending of data failed!");
        done();
      }
    });

    // Send a request with client.  This should trigger the socket onerror_cb.
    client.notify('foo', []);
  });

  // testWebsocketJSONErrorPassthrough, issue 14
  it('should send along messages that fail JSON parsing to fallback message handler',
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
           // response is a fake json response
           this.onmessage({ data: 'this is not JSON' });
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

     });


  // issue 14
  // testWebsocketCallbackError
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
          // fake a json response
          that.onmessage({
            data: $.toJSON({
              jsonrpc: "2.0",
              id: $.parseJSON(data).id,
              result: "foobar"
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
      // chrome prefixes with 'Uncaught Error:', Firefox with 'Error'
      expect(msg.split(':')[1]).to.equal(' Dude, not again');
      window.onerror = null;
      done();
    };

    client.call('foo', [], function() {
      // ooops we have a bug in our callback!
      throw new Error('Dude, not again');
    }, dontCall);

  });

  // issue 11
  // testWebsocketQueueing
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

    // send two requests, then "open" the websocket
    client.call('foo', [], noop, dontCall);
    client.call('foo', [], noop, dontCall);

    // opne socket *after*, both should be queued
    client._ws_socket._open();

    expect(send.calledTwice).to.be.true;

  });

  // issue 11
  // testWebsocketQueueingWithBatching
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
          // fake a json response
          that.onmessage({
            data: $.toJSON({
              jsonrpc: "2.0",
              id: $.parseJSON(data).id,
              result: "foobar"
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

    // batch a request before ws is opened
    var success = sinon.spy();
    client.batch(function(batch) {
      // send two requests, then "open" the websocket
      batch.call('foo', [], success, dontCall);
      batch.call('foo', [], success, dontCall);
      batch.call('foo', [], success, dontCall);
    }, function(results) {
      expect(results.length).to.equal(3);
      expect(success.calledThrice).to.be.true;
      done();
    }, dontCall);

    // finally open the socket
    client._ws_socket._open();

  });
});
