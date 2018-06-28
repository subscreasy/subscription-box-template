(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

if (typeof module !== 'undefined') {
  module.exports = Emitter;
}

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks['$' + event] = this._callbacks['$' + event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  function on() {
    this.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks['$' + event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks['$' + event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks['$' + event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks['$' + event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],2:[function(require,module,exports){
/**
 * Root reference for iframes.
 */

var root;
if (typeof window !== 'undefined') { // Browser window
  root = window;
} else if (typeof self !== 'undefined') { // Web Worker
  root = self;
} else { // Other environments
  console.warn("Using browser-only version of superagent in non-browser environment");
  root = this;
}

var Emitter = require('component-emitter');
var RequestBase = require('./request-base');
var isObject = require('./is-object');
var isFunction = require('./is-function');
var ResponseBase = require('./response-base');
var shouldRetry = require('./should-retry');

/**
 * Noop.
 */

function noop(){};

/**
 * Expose `request`.
 */

var request = exports = module.exports = function(method, url) {
  // callback
  if ('function' == typeof url) {
    return new exports.Request('GET', method).end(url);
  }

  // url first
  if (1 == arguments.length) {
    return new exports.Request('GET', method);
  }

  return new exports.Request(method, url);
}

exports.Request = Request;

/**
 * Determine XHR.
 */

request.getXHR = function () {
  if (root.XMLHttpRequest
      && (!root.location || 'file:' != root.location.protocol
          || !root.ActiveXObject)) {
    return new XMLHttpRequest;
  } else {
    try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP.6.0'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP.3.0'); } catch(e) {}
    try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch(e) {}
  }
  throw Error("Browser-only verison of superagent could not find XHR");
};

/**
 * Removes leading and trailing whitespace, added to support IE.
 *
 * @param {String} s
 * @return {String}
 * @api private
 */

var trim = ''.trim
  ? function(s) { return s.trim(); }
  : function(s) { return s.replace(/(^\s*|\s*$)/g, ''); };

/**
 * Serialize the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api private
 */

function serialize(obj) {
  if (!isObject(obj)) return obj;
  var pairs = [];
  for (var key in obj) {
    pushEncodedKeyValuePair(pairs, key, obj[key]);
  }
  return pairs.join('&');
}

/**
 * Helps 'serialize' with serializing arrays.
 * Mutates the pairs array.
 *
 * @param {Array} pairs
 * @param {String} key
 * @param {Mixed} val
 */

function pushEncodedKeyValuePair(pairs, key, val) {
  if (val != null) {
    if (Array.isArray(val)) {
      val.forEach(function(v) {
        pushEncodedKeyValuePair(pairs, key, v);
      });
    } else if (isObject(val)) {
      for(var subkey in val) {
        pushEncodedKeyValuePair(pairs, key + '[' + subkey + ']', val[subkey]);
      }
    } else {
      pairs.push(encodeURIComponent(key)
        + '=' + encodeURIComponent(val));
    }
  } else if (val === null) {
    pairs.push(encodeURIComponent(key));
  }
}

/**
 * Expose serialization method.
 */

 request.serializeObject = serialize;

 /**
  * Parse the given x-www-form-urlencoded `str`.
  *
  * @param {String} str
  * @return {Object}
  * @api private
  */

function parseString(str) {
  var obj = {};
  var pairs = str.split('&');
  var pair;
  var pos;

  for (var i = 0, len = pairs.length; i < len; ++i) {
    pair = pairs[i];
    pos = pair.indexOf('=');
    if (pos == -1) {
      obj[decodeURIComponent(pair)] = '';
    } else {
      obj[decodeURIComponent(pair.slice(0, pos))] =
        decodeURIComponent(pair.slice(pos + 1));
    }
  }

  return obj;
}

/**
 * Expose parser.
 */

request.parseString = parseString;

/**
 * Default MIME type map.
 *
 *     superagent.types.xml = 'application/xml';
 *
 */

request.types = {
  html: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
  urlencoded: 'application/x-www-form-urlencoded',
  'form': 'application/x-www-form-urlencoded',
  'form-data': 'application/x-www-form-urlencoded'
};

/**
 * Default serialization map.
 *
 *     superagent.serialize['application/xml'] = function(obj){
 *       return 'generated xml here';
 *     };
 *
 */

 request.serialize = {
   'application/x-www-form-urlencoded': serialize,
   'application/json': JSON.stringify
 };

 /**
  * Default parsers.
  *
  *     superagent.parse['application/xml'] = function(str){
  *       return { object parsed from str };
  *     };
  *
  */

request.parse = {
  'application/x-www-form-urlencoded': parseString,
  'application/json': JSON.parse
};

/**
 * Parse the given header `str` into
 * an object containing the mapped fields.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseHeader(str) {
  var lines = str.split(/\r?\n/);
  var fields = {};
  var index;
  var line;
  var field;
  var val;

  lines.pop(); // trailing CRLF

  for (var i = 0, len = lines.length; i < len; ++i) {
    line = lines[i];
    index = line.indexOf(':');
    field = line.slice(0, index).toLowerCase();
    val = trim(line.slice(index + 1));
    fields[field] = val;
  }

  return fields;
}

/**
 * Check if `mime` is json or has +json structured syntax suffix.
 *
 * @param {String} mime
 * @return {Boolean}
 * @api private
 */

function isJSON(mime) {
  return /[\/+]json\b/.test(mime);
}

/**
 * Initialize a new `Response` with the given `xhr`.
 *
 *  - set flags (.ok, .error, etc)
 *  - parse header
 *
 * Examples:
 *
 *  Aliasing `superagent` as `request` is nice:
 *
 *      request = superagent;
 *
 *  We can use the promise-like API, or pass callbacks:
 *
 *      request.get('/').end(function(res){});
 *      request.get('/', function(res){});
 *
 *  Sending data can be chained:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' })
 *        .end(function(res){});
 *
 *  Or passed to `.send()`:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' }, function(res){});
 *
 *  Or passed to `.post()`:
 *
 *      request
 *        .post('/user', { name: 'tj' })
 *        .end(function(res){});
 *
 * Or further reduced to a single call for simple cases:
 *
 *      request
 *        .post('/user', { name: 'tj' }, function(res){});
 *
 * @param {XMLHTTPRequest} xhr
 * @param {Object} options
 * @api private
 */

function Response(req) {
  this.req = req;
  this.xhr = this.req.xhr;
  // responseText is accessible only if responseType is '' or 'text' and on older browsers
  this.text = ((this.req.method !='HEAD' && (this.xhr.responseType === '' || this.xhr.responseType === 'text')) || typeof this.xhr.responseType === 'undefined')
     ? this.xhr.responseText
     : null;
  this.statusText = this.req.xhr.statusText;
  var status = this.xhr.status;
  // handle IE9 bug: http://stackoverflow.com/questions/10046972/msie-returns-status-code-of-1223-for-ajax-request
  if (status === 1223) {
      status = 204;
  }
  this._setStatusProperties(status);
  this.header = this.headers = parseHeader(this.xhr.getAllResponseHeaders());
  // getAllResponseHeaders sometimes falsely returns "" for CORS requests, but
  // getResponseHeader still works. so we get content-type even if getting
  // other headers fails.
  this.header['content-type'] = this.xhr.getResponseHeader('content-type');
  this._setHeaderProperties(this.header);

  if (null === this.text && req._responseType) {
    this.body = this.xhr.response;
  } else {
    this.body = this.req.method != 'HEAD'
      ? this._parseBody(this.text ? this.text : this.xhr.response)
      : null;
  }
}

ResponseBase(Response.prototype);

/**
 * Parse the given body `str`.
 *
 * Used for auto-parsing of bodies. Parsers
 * are defined on the `superagent.parse` object.
 *
 * @param {String} str
 * @return {Mixed}
 * @api private
 */

Response.prototype._parseBody = function(str){
  var parse = request.parse[this.type];
  if(this.req._parser) {
    return this.req._parser(this, str);
  }
  if (!parse && isJSON(this.type)) {
    parse = request.parse['application/json'];
  }
  return parse && str && (str.length || str instanceof Object)
    ? parse(str)
    : null;
};

/**
 * Return an `Error` representative of this response.
 *
 * @return {Error}
 * @api public
 */

Response.prototype.toError = function(){
  var req = this.req;
  var method = req.method;
  var url = req.url;

  var msg = 'cannot ' + method + ' ' + url + ' (' + this.status + ')';
  var err = new Error(msg);
  err.status = this.status;
  err.method = method;
  err.url = url;

  return err;
};

/**
 * Expose `Response`.
 */

request.Response = Response;

/**
 * Initialize a new `Request` with the given `method` and `url`.
 *
 * @param {String} method
 * @param {String} url
 * @api public
 */

function Request(method, url) {
  var self = this;
  this._query = this._query || [];
  this.method = method;
  this.url = url;
  this.header = {}; // preserves header name case
  this._header = {}; // coerces header names to lowercase
  this.on('end', function(){
    var err = null;
    var res = null;

    try {
      res = new Response(self);
    } catch(e) {
      err = new Error('Parser is unable to parse the response');
      err.parse = true;
      err.original = e;
      // issue #675: return the raw response if the response parsing fails
      if (self.xhr) {
        // ie9 doesn't have 'response' property
        err.rawResponse = typeof self.xhr.responseType == 'undefined' ? self.xhr.responseText : self.xhr.response;
        // issue #876: return the http status code if the response parsing fails
        err.status = self.xhr.status ? self.xhr.status : null;
        err.statusCode = err.status; // backwards-compat only
      } else {
        err.rawResponse = null;
        err.status = null;
      }

      return self.callback(err);
    }

    self.emit('response', res);

    var new_err;
    try {
      if (!self._isResponseOK(res)) {
        new_err = new Error(res.statusText || 'Unsuccessful HTTP response');
        new_err.original = err;
        new_err.response = res;
        new_err.status = res.status;
      }
    } catch(e) {
      new_err = e; // #985 touching res may cause INVALID_STATE_ERR on old Android
    }

    // #1000 don't catch errors from the callback to avoid double calling it
    if (new_err) {
      self.callback(new_err, res);
    } else {
      self.callback(null, res);
    }
  });
}

/**
 * Mixin `Emitter` and `RequestBase`.
 */

Emitter(Request.prototype);
RequestBase(Request.prototype);

/**
 * Set Content-Type to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.xml = 'application/xml';
 *
 *      request.post('/')
 *        .type('xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 *      request.post('/')
 *        .type('application/xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 * @param {String} type
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.type = function(type){
  this.set('Content-Type', request.types[type] || type);
  return this;
};

/**
 * Set Accept to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.json = 'application/json';
 *
 *      request.get('/agent')
 *        .accept('json')
 *        .end(callback);
 *
 *      request.get('/agent')
 *        .accept('application/json')
 *        .end(callback);
 *
 * @param {String} accept
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.accept = function(type){
  this.set('Accept', request.types[type] || type);
  return this;
};

/**
 * Set Authorization field value with `user` and `pass`.
 *
 * @param {String} user
 * @param {String} [pass] optional in case of using 'bearer' as type
 * @param {Object} options with 'type' property 'auto', 'basic' or 'bearer' (default 'basic')
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.auth = function(user, pass, options){
  if (typeof pass === 'object' && pass !== null) { // pass is optional and can substitute for options
    options = pass;
  }
  if (!options) {
    options = {
      type: 'function' === typeof btoa ? 'basic' : 'auto',
    }
  }

  switch (options.type) {
    case 'basic':
      this.set('Authorization', 'Basic ' + btoa(user + ':' + pass));
    break;

    case 'auto':
      this.username = user;
      this.password = pass;
    break;
      
    case 'bearer': // usage would be .auth(accessToken, { type: 'bearer' })
      this.set('Authorization', 'Bearer ' + user);
    break;  
  }
  return this;
};

/**
 * Add query-string `val`.
 *
 * Examples:
 *
 *   request.get('/shoes')
 *     .query('size=10')
 *     .query({ color: 'blue' })
 *
 * @param {Object|String} val
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.query = function(val){
  if ('string' != typeof val) val = serialize(val);
  if (val) this._query.push(val);
  return this;
};

/**
 * Queue the given `file` as an attachment to the specified `field`,
 * with optional `options` (or filename).
 *
 * ``` js
 * request.post('/upload')
 *   .attach('content', new Blob(['<a id="a"><b id="b">hey!</b></a>'], { type: "text/html"}))
 *   .end(callback);
 * ```
 *
 * @param {String} field
 * @param {Blob|File} file
 * @param {String|Object} options
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.attach = function(field, file, options){
  if (file) {
    if (this._data) {
      throw Error("superagent can't mix .send() and .attach()");
    }

    this._getFormData().append(field, file, options || file.name);
  }
  return this;
};

Request.prototype._getFormData = function(){
  if (!this._formData) {
    this._formData = new root.FormData();
  }
  return this._formData;
};

/**
 * Invoke the callback with `err` and `res`
 * and handle arity check.
 *
 * @param {Error} err
 * @param {Response} res
 * @api private
 */

Request.prototype.callback = function(err, res){
  // console.log(this._retries, this._maxRetries)
  if (this._maxRetries && this._retries++ < this._maxRetries && shouldRetry(err, res)) {
    return this._retry();
  }

  var fn = this._callback;
  this.clearTimeout();

  if (err) {
    if (this._maxRetries) err.retries = this._retries - 1;
    this.emit('error', err);
  }

  fn(err, res);
};

/**
 * Invoke callback with x-domain error.
 *
 * @api private
 */

Request.prototype.crossDomainError = function(){
  var err = new Error('Request has been terminated\nPossible causes: the network is offline, Origin is not allowed by Access-Control-Allow-Origin, the page is being unloaded, etc.');
  err.crossDomain = true;

  err.status = this.status;
  err.method = this.method;
  err.url = this.url;

  this.callback(err);
};

// This only warns, because the request is still likely to work
Request.prototype.buffer = Request.prototype.ca = Request.prototype.agent = function(){
  console.warn("This is not supported in browser version of superagent");
  return this;
};

// This throws, because it can't send/receive data as expected
Request.prototype.pipe = Request.prototype.write = function(){
  throw Error("Streaming is not supported in browser version of superagent");
};

/**
 * Compose querystring to append to req.url
 *
 * @api private
 */

Request.prototype._appendQueryString = function(){
  var query = this._query.join('&');
  if (query) {
    this.url += (this.url.indexOf('?') >= 0 ? '&' : '?') + query;
  }

  if (this._sort) {
    var index = this.url.indexOf('?');
    if (index >= 0) {
      var queryArr = this.url.substring(index + 1).split('&');
      if (isFunction(this._sort)) {
        queryArr.sort(this._sort);
      } else {
        queryArr.sort();
      }
      this.url = this.url.substring(0, index) + '?' + queryArr.join('&');
    }
  }
};

/**
 * Check if `obj` is a host object,
 * we don't want to serialize these :)
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */
Request.prototype._isHost = function _isHost(obj) {
  // Native objects stringify to [object File], [object Blob], [object FormData], etc.
  return obj && 'object' === typeof obj && !Array.isArray(obj) && Object.prototype.toString.call(obj) !== '[object Object]';
}

/**
 * Initiate request, invoking callback `fn(res)`
 * with an instanceof `Response`.
 *
 * @param {Function} fn
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.end = function(fn){
  if (this._endCalled) {
    console.warn("Warning: .end() was called twice. This is not supported in superagent");
  }
  this._endCalled = true;

  // store callback
  this._callback = fn || noop;

  // querystring
  this._appendQueryString();

  return this._end();
};

Request.prototype._end = function() {
  var self = this;
  var xhr = this.xhr = request.getXHR();
  var data = this._formData || this._data;

  this._setTimeouts();

  // state change
  xhr.onreadystatechange = function(){
    var readyState = xhr.readyState;
    if (readyState >= 2 && self._responseTimeoutTimer) {
      clearTimeout(self._responseTimeoutTimer);
    }
    if (4 != readyState) {
      return;
    }

    // In IE9, reads to any property (e.g. status) off of an aborted XHR will
    // result in the error "Could not complete the operation due to error c00c023f"
    var status;
    try { status = xhr.status } catch(e) { status = 0; }

    if (!status) {
      if (self.timedout || self._aborted) return;
      return self.crossDomainError();
    }
    self.emit('end');
  };

  // progress
  var handleProgress = function(direction, e) {
    if (e.total > 0) {
      e.percent = e.loaded / e.total * 100;
    }
    e.direction = direction;
    self.emit('progress', e);
  }
  if (this.hasListeners('progress')) {
    try {
      xhr.onprogress = handleProgress.bind(null, 'download');
      if (xhr.upload) {
        xhr.upload.onprogress = handleProgress.bind(null, 'upload');
      }
    } catch(e) {
      // Accessing xhr.upload fails in IE from a web worker, so just pretend it doesn't exist.
      // Reported here:
      // https://connect.microsoft.com/IE/feedback/details/837245/xmlhttprequest-upload-throws-invalid-argument-when-used-from-web-worker-context
    }
  }

  // initiate request
  try {
    if (this.username && this.password) {
      xhr.open(this.method, this.url, true, this.username, this.password);
    } else {
      xhr.open(this.method, this.url, true);
    }
  } catch (err) {
    // see #1149
    return this.callback(err);
  }

  // CORS
  if (this._withCredentials) xhr.withCredentials = true;

  // body
  if (!this._formData && 'GET' != this.method && 'HEAD' != this.method && 'string' != typeof data && !this._isHost(data)) {
    // serialize stuff
    var contentType = this._header['content-type'];
    var serialize = this._serializer || request.serialize[contentType ? contentType.split(';')[0] : ''];
    if (!serialize && isJSON(contentType)) {
      serialize = request.serialize['application/json'];
    }
    if (serialize) data = serialize(data);
  }

  // set header fields
  for (var field in this.header) {
    if (null == this.header[field]) continue;

    if (this.header.hasOwnProperty(field))
      xhr.setRequestHeader(field, this.header[field]);
  }

  if (this._responseType) {
    xhr.responseType = this._responseType;
  }

  // send stuff
  this.emit('request', this);

  // IE11 xhr.send(undefined) sends 'undefined' string as POST payload (instead of nothing)
  // We need null here if data is undefined
  xhr.send(typeof data !== 'undefined' ? data : null);
  return this;
};

/**
 * GET `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.get = function(url, data, fn){
  var req = request('GET', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.query(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * HEAD `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.head = function(url, data, fn){
  var req = request('HEAD', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * OPTIONS query to `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.options = function(url, data, fn){
  var req = request('OPTIONS', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * DELETE `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

function del(url, data, fn){
  var req = request('DELETE', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

request['del'] = del;
request['delete'] = del;

/**
 * PATCH `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.patch = function(url, data, fn){
  var req = request('PATCH', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * POST `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.post = function(url, data, fn){
  var req = request('POST', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

/**
 * PUT `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.put = function(url, data, fn){
  var req = request('PUT', url);
  if ('function' == typeof data) fn = data, data = null;
  if (data) req.send(data);
  if (fn) req.end(fn);
  return req;
};

},{"./is-function":3,"./is-object":4,"./request-base":5,"./response-base":6,"./should-retry":7,"component-emitter":1}],3:[function(require,module,exports){
/**
 * Check if `fn` is a function.
 *
 * @param {Function} fn
 * @return {Boolean}
 * @api private
 */
var isObject = require('./is-object');

function isFunction(fn) {
  var tag = isObject(fn) ? Object.prototype.toString.call(fn) : '';
  return tag === '[object Function]';
}

module.exports = isFunction;

},{"./is-object":4}],4:[function(require,module,exports){
/**
 * Check if `obj` is an object.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isObject(obj) {
  return null !== obj && 'object' === typeof obj;
}

module.exports = isObject;

},{}],5:[function(require,module,exports){
/**
 * Module of mixed-in functions shared between node and client code
 */
var isObject = require('./is-object');

/**
 * Expose `RequestBase`.
 */

module.exports = RequestBase;

/**
 * Initialize a new `RequestBase`.
 *
 * @api public
 */

function RequestBase(obj) {
  if (obj) return mixin(obj);
}

/**
 * Mixin the prototype properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in RequestBase.prototype) {
    obj[key] = RequestBase.prototype[key];
  }
  return obj;
}

/**
 * Clear previous timeout.
 *
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.clearTimeout = function _clearTimeout(){
  clearTimeout(this._timer);
  clearTimeout(this._responseTimeoutTimer);
  delete this._timer;
  delete this._responseTimeoutTimer;
  return this;
};

/**
 * Override default response body parser
 *
 * This function will be called to convert incoming data into request.body
 *
 * @param {Function}
 * @api public
 */

RequestBase.prototype.parse = function parse(fn){
  this._parser = fn;
  return this;
};

/**
 * Set format of binary response body.
 * In browser valid formats are 'blob' and 'arraybuffer',
 * which return Blob and ArrayBuffer, respectively.
 *
 * In Node all values result in Buffer.
 *
 * Examples:
 *
 *      req.get('/')
 *        .responseType('blob')
 *        .end(callback);
 *
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.responseType = function(val){
  this._responseType = val;
  return this;
};

/**
 * Override default request body serializer
 *
 * This function will be called to convert data set via .send or .attach into payload to send
 *
 * @param {Function}
 * @api public
 */

RequestBase.prototype.serialize = function serialize(fn){
  this._serializer = fn;
  return this;
};

/**
 * Set timeouts.
 *
 * - response timeout is time between sending request and receiving the first byte of the response. Includes DNS and connection time.
 * - deadline is the time from start of the request to receiving response body in full. If the deadline is too short large files may not load at all on slow connections.
 *
 * Value of 0 or false means no timeout.
 *
 * @param {Number|Object} ms or {response, read, deadline}
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.timeout = function timeout(options){
  if (!options || 'object' !== typeof options) {
    this._timeout = options;
    this._responseTimeout = 0;
    return this;
  }

  for(var option in options) {
    switch(option) {
      case 'deadline':
        this._timeout = options.deadline;
        break;
      case 'response':
        this._responseTimeout = options.response;
        break;
      default:
        console.warn("Unknown timeout option", option);
    }
  }
  return this;
};

/**
 * Set number of retry attempts on error.
 *
 * Failed requests will be retried 'count' times if timeout or err.code >= 500.
 *
 * @param {Number} count
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.retry = function retry(count){
  // Default to 1 if no count passed or true
  if (arguments.length === 0 || count === true) count = 1;
  if (count <= 0) count = 0;
  this._maxRetries = count;
  this._retries = 0;
  return this;
};

/**
 * Retry request
 *
 * @return {Request} for chaining
 * @api private
 */

RequestBase.prototype._retry = function() {
  this.clearTimeout();

  // node
  if (this.req) {
    this.req = null;
    this.req = this.request();
  }

  this._aborted = false;
  this.timedout = false;

  return this._end();
};

/**
 * Promise support
 *
 * @param {Function} resolve
 * @param {Function} [reject]
 * @return {Request}
 */

RequestBase.prototype.then = function then(resolve, reject) {
  if (!this._fullfilledPromise) {
    var self = this;
    if (this._endCalled) {
      console.warn("Warning: superagent request was sent twice, because both .end() and .then() were called. Never call .end() if you use promises");
    }
    this._fullfilledPromise = new Promise(function(innerResolve, innerReject){
      self.end(function(err, res){
        if (err) innerReject(err); else innerResolve(res);
      });
    });
  }
  return this._fullfilledPromise.then(resolve, reject);
}

RequestBase.prototype.catch = function(cb) {
  return this.then(undefined, cb);
};

/**
 * Allow for extension
 */

RequestBase.prototype.use = function use(fn) {
  fn(this);
  return this;
}

RequestBase.prototype.ok = function(cb) {
  if ('function' !== typeof cb) throw Error("Callback required");
  this._okCallback = cb;
  return this;
};

RequestBase.prototype._isResponseOK = function(res) {
  if (!res) {
    return false;
  }

  if (this._okCallback) {
    return this._okCallback(res);
  }

  return res.status >= 200 && res.status < 300;
};


/**
 * Get request header `field`.
 * Case-insensitive.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */

RequestBase.prototype.get = function(field){
  return this._header[field.toLowerCase()];
};

/**
 * Get case-insensitive header `field` value.
 * This is a deprecated internal API. Use `.get(field)` instead.
 *
 * (getHeader is no longer used internally by the superagent code base)
 *
 * @param {String} field
 * @return {String}
 * @api private
 * @deprecated
 */

RequestBase.prototype.getHeader = RequestBase.prototype.get;

/**
 * Set header `field` to `val`, or multiple fields with one object.
 * Case-insensitive.
 *
 * Examples:
 *
 *      req.get('/')
 *        .set('Accept', 'application/json')
 *        .set('X-API-Key', 'foobar')
 *        .end(callback);
 *
 *      req.get('/')
 *        .set({ Accept: 'application/json', 'X-API-Key': 'foobar' })
 *        .end(callback);
 *
 * @param {String|Object} field
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.set = function(field, val){
  if (isObject(field)) {
    for (var key in field) {
      this.set(key, field[key]);
    }
    return this;
  }
  this._header[field.toLowerCase()] = val;
  this.header[field] = val;
  return this;
};

/**
 * Remove header `field`.
 * Case-insensitive.
 *
 * Example:
 *
 *      req.get('/')
 *        .unset('User-Agent')
 *        .end(callback);
 *
 * @param {String} field
 */
RequestBase.prototype.unset = function(field){
  delete this._header[field.toLowerCase()];
  delete this.header[field];
  return this;
};

/**
 * Write the field `name` and `val`, or multiple fields with one object
 * for "multipart/form-data" request bodies.
 *
 * ``` js
 * request.post('/upload')
 *   .field('foo', 'bar')
 *   .end(callback);
 *
 * request.post('/upload')
 *   .field({ foo: 'bar', baz: 'qux' })
 *   .end(callback);
 * ```
 *
 * @param {String|Object} name
 * @param {String|Blob|File|Buffer|fs.ReadStream} val
 * @return {Request} for chaining
 * @api public
 */
RequestBase.prototype.field = function(name, val) {

  // name should be either a string or an object.
  if (null === name ||  undefined === name) {
    throw new Error('.field(name, val) name can not be empty');
  }

  if (this._data) {
    console.error(".field() can't be used if .send() is used. Please use only .send() or only .field() & .attach()");
  }

  if (isObject(name)) {
    for (var key in name) {
      this.field(key, name[key]);
    }
    return this;
  }

  if (Array.isArray(val)) {
    for (var i in val) {
      this.field(name, val[i]);
    }
    return this;
  }

  // val should be defined now
  if (null === val || undefined === val) {
    throw new Error('.field(name, val) val can not be empty');
  }
  if ('boolean' === typeof val) {
    val = '' + val;
  }
  this._getFormData().append(name, val);
  return this;
};

/**
 * Abort the request, and clear potential timeout.
 *
 * @return {Request}
 * @api public
 */
RequestBase.prototype.abort = function(){
  if (this._aborted) {
    return this;
  }
  this._aborted = true;
  this.xhr && this.xhr.abort(); // browser
  this.req && this.req.abort(); // node
  this.clearTimeout();
  this.emit('abort');
  return this;
};

/**
 * Enable transmission of cookies with x-domain requests.
 *
 * Note that for this to work the origin must not be
 * using "Access-Control-Allow-Origin" with a wildcard,
 * and also must set "Access-Control-Allow-Credentials"
 * to "true".
 *
 * @api public
 */

RequestBase.prototype.withCredentials = function(on){
  // This is browser-only functionality. Node side is no-op.
  if(on==undefined) on = true;
  this._withCredentials = on;
  return this;
};

/**
 * Set the max redirects to `n`. Does noting in browser XHR implementation.
 *
 * @param {Number} n
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.redirects = function(n){
  this._maxRedirects = n;
  return this;
};

/**
 * Convert to a plain javascript object (not JSON string) of scalar properties.
 * Note as this method is designed to return a useful non-this value,
 * it cannot be chained.
 *
 * @return {Object} describing method, url, and data of this request
 * @api public
 */

RequestBase.prototype.toJSON = function(){
  return {
    method: this.method,
    url: this.url,
    data: this._data,
    headers: this._header
  };
};


/**
 * Send `data` as the request body, defaulting the `.type()` to "json" when
 * an object is given.
 *
 * Examples:
 *
 *       // manual json
 *       request.post('/user')
 *         .type('json')
 *         .send('{"name":"tj"}')
 *         .end(callback)
 *
 *       // auto json
 *       request.post('/user')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // manual x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send('name=tj')
 *         .end(callback)
 *
 *       // auto x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // defaults to x-www-form-urlencoded
 *      request.post('/user')
 *        .send('name=tobi')
 *        .send('species=ferret')
 *        .end(callback)
 *
 * @param {String|Object} data
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.send = function(data){
  var isObj = isObject(data);
  var type = this._header['content-type'];

  if (this._formData) {
    console.error(".send() can't be used if .attach() or .field() is used. Please use only .send() or only .field() & .attach()");
  }

  if (isObj && !this._data) {
    if (Array.isArray(data)) {
      this._data = [];
    } else if (!this._isHost(data)) {
      this._data = {};
    }
  } else if (data && this._data && this._isHost(this._data)) {
    throw Error("Can't merge these send calls");
  }

  // merge
  if (isObj && isObject(this._data)) {
    for (var key in data) {
      this._data[key] = data[key];
    }
  } else if ('string' == typeof data) {
    // default to x-www-form-urlencoded
    if (!type) this.type('form');
    type = this._header['content-type'];
    if ('application/x-www-form-urlencoded' == type) {
      this._data = this._data
        ? this._data + '&' + data
        : data;
    } else {
      this._data = (this._data || '') + data;
    }
  } else {
    this._data = data;
  }

  if (!isObj || this._isHost(data)) {
    return this;
  }

  // default to json
  if (!type) this.type('json');
  return this;
};


/**
 * Sort `querystring` by the sort function
 *
 *
 * Examples:
 *
 *       // default order
 *       request.get('/user')
 *         .query('name=Nick')
 *         .query('search=Manny')
 *         .sortQuery()
 *         .end(callback)
 *
 *       // customized sort function
 *       request.get('/user')
 *         .query('name=Nick')
 *         .query('search=Manny')
 *         .sortQuery(function(a, b){
 *           return a.length - b.length;
 *         })
 *         .end(callback)
 *
 *
 * @param {Function} sort
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.sortQuery = function(sort) {
  // _sort default to true but otherwise can be a function or boolean
  this._sort = typeof sort === 'undefined' ? true : sort;
  return this;
};

/**
 * Invoke callback with timeout error.
 *
 * @api private
 */

RequestBase.prototype._timeoutError = function(reason, timeout, errno){
  if (this._aborted) {
    return;
  }
  var err = new Error(reason + timeout + 'ms exceeded');
  err.timeout = timeout;
  err.code = 'ECONNABORTED';
  err.errno = errno;
  this.timedout = true;
  this.abort();
  this.callback(err);
};

RequestBase.prototype._setTimeouts = function() {
  var self = this;

  // deadline
  if (this._timeout && !this._timer) {
    this._timer = setTimeout(function(){
      self._timeoutError('Timeout of ', self._timeout, 'ETIME');
    }, this._timeout);
  }
  // response timeout
  if (this._responseTimeout && !this._responseTimeoutTimer) {
    this._responseTimeoutTimer = setTimeout(function(){
      self._timeoutError('Response timeout of ', self._responseTimeout, 'ETIMEDOUT');
    }, this._responseTimeout);
  }
}

},{"./is-object":4}],6:[function(require,module,exports){

/**
 * Module dependencies.
 */

var utils = require('./utils');

/**
 * Expose `ResponseBase`.
 */

module.exports = ResponseBase;

/**
 * Initialize a new `ResponseBase`.
 *
 * @api public
 */

function ResponseBase(obj) {
  if (obj) return mixin(obj);
}

/**
 * Mixin the prototype properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in ResponseBase.prototype) {
    obj[key] = ResponseBase.prototype[key];
  }
  return obj;
}

/**
 * Get case-insensitive `field` value.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */

ResponseBase.prototype.get = function(field){
    return this.header[field.toLowerCase()];
};

/**
 * Set header related properties:
 *
 *   - `.type` the content type without params
 *
 * A response of "Content-Type: text/plain; charset=utf-8"
 * will provide you with a `.type` of "text/plain".
 *
 * @param {Object} header
 * @api private
 */

ResponseBase.prototype._setHeaderProperties = function(header){
    // TODO: moar!
    // TODO: make this a util

    // content-type
    var ct = header['content-type'] || '';
    this.type = utils.type(ct);

    // params
    var params = utils.params(ct);
    for (var key in params) this[key] = params[key];

    this.links = {};

    // links
    try {
        if (header.link) {
            this.links = utils.parseLinks(header.link);
        }
    } catch (err) {
        // ignore
    }
};

/**
 * Set flags such as `.ok` based on `status`.
 *
 * For example a 2xx response will give you a `.ok` of __true__
 * whereas 5xx will be __false__ and `.error` will be __true__. The
 * `.clientError` and `.serverError` are also available to be more
 * specific, and `.statusType` is the class of error ranging from 1..5
 * sometimes useful for mapping respond colors etc.
 *
 * "sugar" properties are also defined for common cases. Currently providing:
 *
 *   - .noContent
 *   - .badRequest
 *   - .unauthorized
 *   - .notAcceptable
 *   - .notFound
 *
 * @param {Number} status
 * @api private
 */

ResponseBase.prototype._setStatusProperties = function(status){
    var type = status / 100 | 0;

    // status / class
    this.status = this.statusCode = status;
    this.statusType = type;

    // basics
    this.info = 1 == type;
    this.ok = 2 == type;
    this.redirect = 3 == type;
    this.clientError = 4 == type;
    this.serverError = 5 == type;
    this.error = (4 == type || 5 == type)
        ? this.toError()
        : false;

    // sugar
    this.accepted = 202 == status;
    this.noContent = 204 == status;
    this.badRequest = 400 == status;
    this.unauthorized = 401 == status;
    this.notAcceptable = 406 == status;
    this.forbidden = 403 == status;
    this.notFound = 404 == status;
};

},{"./utils":8}],7:[function(require,module,exports){
var ERROR_CODES = [
  'ECONNRESET',
  'ETIMEDOUT',
  'EADDRINFO',
  'ESOCKETTIMEDOUT'
];

/**
 * Determine if a request should be retried.
 * (Borrowed from segmentio/superagent-retry)
 *
 * @param {Error} err
 * @param {Response} [res]
 * @returns {Boolean}
 */
module.exports = function shouldRetry(err, res) {
  if (err && err.code && ~ERROR_CODES.indexOf(err.code)) return true;
  if (res && res.status && res.status >= 500) return true;
  // Superagent timeout
  if (err && 'timeout' in err && err.code == 'ECONNABORTED') return true;
  if (err && 'crossDomain' in err) return true;
  return false;
};

},{}],8:[function(require,module,exports){

/**
 * Return the mime type for the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

exports.type = function(str){
  return str.split(/ *; */).shift();
};

/**
 * Return header field parameters.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

exports.params = function(str){
  return str.split(/ *; */).reduce(function(obj, str){
    var parts = str.split(/ *= */);
    var key = parts.shift();
    var val = parts.shift();

    if (key && val) obj[key] = val;
    return obj;
  }, {});
};

/**
 * Parse Link header fields.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

exports.parseLinks = function(str){
  return str.split(/ *, */).reduce(function(obj, str){
    var parts = str.split(/ *; */);
    var url = parts[0].slice(1, -1);
    var rel = parts[1].split(/ *= */)[1].slice(1, -1);
    obj[rel] = url;
    return obj;
  }, {});
};

/**
 * Strip content related fields from `header`.
 *
 * @param {Object} header
 * @return {Object} header
 * @api private
 */

exports.cleanHeader = function(header, shouldStripCookie){
  delete header['content-type'];
  delete header['content-length'];
  delete header['transfer-encoding'];
  delete header['host'];
  if (shouldStripCookie) {
    delete header['cookie'];
  }
  return header;
};
},{}],9:[function(require,module,exports){
(function (Buffer){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['superagent', 'querystring'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('superagent'), require('querystring'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ApiClient = factory(root.superagent, root.querystring);
  }
}(this, function(superagent, querystring) {
  'use strict';

  /**
   * @module ApiClient
   * @version 1.0
   */

  /**
   * Manages low level client-server communications, parameter marshalling, etc. There should not be any need for an
   * application to use this class directly - the *Api and model classes provide the public API for the service. The
   * contents of this file should be regarded as internal but are documented for completeness.
   * @alias module:ApiClient
   * @class
   */
  var exports = function() {
    /**
     * The base URL against which to resolve every API call's (relative) path.
     * @type {String}
     * @default https://localhost:8080
     */
    this.basePath = 'https://localhost:8080'.replace(/\/+$/, '');

    /**
     * The authentication methods to be included for all API calls.
     * @type {Array.<String>}
     */
    this.authentications = {
      'apiKey': {type: 'apiKey', 'in': 'header', name: 'Authorization'}
    };
    /**
     * The default HTTP headers to be included for all API calls.
     * @type {Array.<String>}
     * @default {}
     */
    this.defaultHeaders = {};

    /**
     * The default HTTP timeout for all API calls.
     * @type {Number}
     * @default 60000
     */
    this.timeout = 60000;

    /**
     * If set to false an additional timestamp parameter is added to all API GET calls to
     * prevent browser caching
     * @type {Boolean}
     * @default true
     */
    this.cache = true;

    /**
     * If set to true, the client will save the cookies from each server
     * response, and return them in the next request.
     * @default false
     */
    this.enableCookies = false;

    /*
     * Used to save and return cookies in a node.js (non-browser) setting,
     * if this.enableCookies is set to true.
     */
    if (typeof window === 'undefined') {
      this.agent = new superagent.agent();
    }

    /*
     * Allow user to override superagent agent
     */
    this.requestAgent = null;
  };

  /**
   * Returns a string representation for an actual parameter.
   * @param param The actual parameter.
   * @returns {String} The string representation of <code>param</code>.
   */
  exports.prototype.paramToString = function(param) {
    if (param == undefined || param == null) {
      return '';
    }
    if (param instanceof Date) {
      return param.toJSON();
    }
    return param.toString();
  };

  /**
   * Builds full URL by appending the given path to the base URL and replacing path parameter place-holders with parameter values.
   * NOTE: query parameters are not handled here.
   * @param {String} path The path to append to the base URL.
   * @param {Object} pathParams The parameter values to append.
   * @returns {String} The encoded path with parameter values substituted.
   */
  exports.prototype.buildUrl = function(path, pathParams) {
    if (!path.match(/^\//)) {
      path = '/' + path;
    }
    var url = this.basePath + path;
    var _this = this;
    url = url.replace(/\{([\w-]+)\}/g, function(fullMatch, key) {
      var value;
      if (pathParams.hasOwnProperty(key)) {
        value = _this.paramToString(pathParams[key]);
      } else {
        value = fullMatch;
      }
      return encodeURIComponent(value);
    });
    return url;
  };

  /**
   * Checks whether the given content type represents JSON.<br>
   * JSON content type examples:<br>
   * <ul>
   * <li>application/json</li>
   * <li>application/json; charset=UTF8</li>
   * <li>APPLICATION/JSON</li>
   * </ul>
   * @param {String} contentType The MIME content type to check.
   * @returns {Boolean} <code>true</code> if <code>contentType</code> represents JSON, otherwise <code>false</code>.
   */
  exports.prototype.isJsonMime = function(contentType) {
    return Boolean(contentType != null && contentType.match(/^application\/json(;.*)?$/i));
  };

  /**
   * Chooses a content type from the given array, with JSON preferred; i.e. return JSON if included, otherwise return the first.
   * @param {Array.<String>} contentTypes
   * @returns {String} The chosen content type, preferring JSON.
   */
  exports.prototype.jsonPreferredMime = function(contentTypes) {
    for (var i = 0; i < contentTypes.length; i++) {
      if (this.isJsonMime(contentTypes[i])) {
        return contentTypes[i];
      }
    }
    return contentTypes[0];
  };

  /**
   * Checks whether the given parameter value represents file-like content.
   * @param param The parameter to check.
   * @returns {Boolean} <code>true</code> if <code>param</code> represents a file.
   */
  exports.prototype.isFileParam = function(param) {
    // fs.ReadStream in Node.js and Electron (but not in runtime like browserify)
    if (typeof require === 'function') {
      var fs;
      try {
        fs = require('fs');
      } catch (err) {}
      if (fs && fs.ReadStream && param instanceof fs.ReadStream) {
        return true;
      }
    }
    // Buffer in Node.js
    if (typeof Buffer === 'function' && param instanceof Buffer) {
      return true;
    }
    // Blob in browser
    if (typeof Blob === 'function' && param instanceof Blob) {
      return true;
    }
    // File in browser (it seems File object is also instance of Blob, but keep this for safe)
    if (typeof File === 'function' && param instanceof File) {
      return true;
    }
    return false;
  };

  /**
   * Normalizes parameter values:
   * <ul>
   * <li>remove nils</li>
   * <li>keep files and arrays</li>
   * <li>format to string with `paramToString` for other cases</li>
   * </ul>
   * @param {Object.<String, Object>} params The parameters as object properties.
   * @returns {Object.<String, Object>} normalized parameters.
   */
  exports.prototype.normalizeParams = function(params) {
    var newParams = {};
    for (var key in params) {
      if (params.hasOwnProperty(key) && params[key] != undefined && params[key] != null) {
        var value = params[key];
        if (this.isFileParam(value) || Array.isArray(value)) {
          newParams[key] = value;
        } else {
          newParams[key] = this.paramToString(value);
        }
      }
    }
    return newParams;
  };

  /**
   * Enumeration of collection format separator strategies.
   * @enum {String}
   * @readonly
   */
  exports.CollectionFormatEnum = {
    /**
     * Comma-separated values. Value: <code>csv</code>
     * @const
     */
    CSV: ',',
    /**
     * Space-separated values. Value: <code>ssv</code>
     * @const
     */
    SSV: ' ',
    /**
     * Tab-separated values. Value: <code>tsv</code>
     * @const
     */
    TSV: '\t',
    /**
     * Pipe(|)-separated values. Value: <code>pipes</code>
     * @const
     */
    PIPES: '|',
    /**
     * Native array. Value: <code>multi</code>
     * @const
     */
    MULTI: 'multi'
  };

  /**
   * Builds a string representation of an array-type actual parameter, according to the given collection format.
   * @param {Array} param An array parameter.
   * @param {module:ApiClient.CollectionFormatEnum} collectionFormat The array element separator strategy.
   * @returns {String|Array} A string representation of the supplied collection, using the specified delimiter. Returns
   * <code>param</code> as is if <code>collectionFormat</code> is <code>multi</code>.
   */
  exports.prototype.buildCollectionParam = function buildCollectionParam(param, collectionFormat) {
    if (param == null) {
      return null;
    }
    switch (collectionFormat) {
      case 'csv':
        return param.map(this.paramToString).join(',');
      case 'ssv':
        return param.map(this.paramToString).join(' ');
      case 'tsv':
        return param.map(this.paramToString).join('\t');
      case 'pipes':
        return param.map(this.paramToString).join('|');
      case 'multi':
        // return the array directly as SuperAgent will handle it as expected
        return param.map(this.paramToString);
      default:
        throw new Error('Unknown collection format: ' + collectionFormat);
    }
  };

  /**
   * Applies authentication headers to the request.
   * @param {Object} request The request object created by a <code>superagent()</code> call.
   * @param {Array.<String>} authNames An array of authentication method names.
   */
  exports.prototype.applyAuthToRequest = function(request, authNames) {
    var _this = this;
    authNames.forEach(function(authName) {
      var auth = _this.authentications[authName];
      switch (auth.type) {
        case 'basic':
          if (auth.username || auth.password) {
            request.auth(auth.username || '', auth.password || '');
          }
          break;
        case 'apiKey':
          if (auth.apiKey) {
            var data = {};
            if (auth.apiKeyPrefix) {
              data[auth.name] = auth.apiKeyPrefix + ' ' + auth.apiKey;
            } else {
              data[auth.name] = auth.apiKey;
            }
            if (auth['in'] === 'header') {
              request.set(data);
            } else {
              request.query(data);
            }
          }
          break;
        case 'oauth2':
          if (auth.accessToken) {
            request.set({'Authorization': 'Bearer ' + auth.accessToken});
          }
          break;
        default:
          throw new Error('Unknown authentication type: ' + auth.type);
      }
    });
  };

  /**
   * Deserializes an HTTP response body into a value of the specified type.
   * @param {Object} response A SuperAgent response object.
   * @param {(String|Array.<String>|Object.<String, Object>|Function)} returnType The type to return. Pass a string for simple types
   * or the constructor function for a complex type. Pass an array containing the type name to return an array of that type. To
   * return an object, pass an object with one property whose name is the key type and whose value is the corresponding value type:
   * all properties on <code>data<code> will be converted to this type.
   * @returns A value of the specified type.
   */
  exports.prototype.deserialize = function deserialize(response, returnType) {
    if (response == null || returnType == null || response.status == 204) {
      return null;
    }
    // Rely on SuperAgent for parsing response body.
    // See http://visionmedia.github.io/superagent/#parsing-response-bodies
    var data = response.body;
    if (data == null || (typeof data === 'object' && typeof data.length === 'undefined' && !Object.keys(data).length)) {
      // SuperAgent does not always produce a body; use the unparsed response as a fallback
      data = response.text;
    }
    return exports.convertToType(data, returnType);
  };

  /**
   * Callback function to receive the result of the operation.
   * @callback module:ApiClient~callApiCallback
   * @param {String} error Error message, if any.
   * @param data The data returned by the service call.
   * @param {String} response The complete HTTP response.
   */

  /**
   * Invokes the REST service using the supplied settings and parameters.
   * @param {String} path The base URL to invoke.
   * @param {String} httpMethod The HTTP method to use.
   * @param {Object.<String, String>} pathParams A map of path parameters and their values.
   * @param {Object.<String, Object>} queryParams A map of query parameters and their values.
   * @param {Object.<String, Object>} collectionQueryParams A map of collection query parameters and their values.
   * @param {Object.<String, Object>} headerParams A map of header parameters and their values.
   * @param {Object.<String, Object>} formParams A map of form parameters and their values.
   * @param {Object} bodyParam The value to pass as the request body.
   * @param {Array.<String>} authNames An array of authentication type names.
   * @param {Array.<String>} contentTypes An array of request MIME types.
   * @param {Array.<String>} accepts An array of acceptable response MIME types.
   * @param {(String|Array|ObjectFunction)} returnType The required type to return; can be a string for simple types or the
   * constructor for a complex type.
   * @param {module:ApiClient~callApiCallback} callback The callback function.
   * @returns {Object} The SuperAgent request object.
   */
  exports.prototype.callApi = function callApi(path, httpMethod, pathParams,
      queryParams, collectionQueryParams, headerParams, formParams, bodyParam, authNames, contentTypes, accepts,
      returnType, callback) {

    var _this = this;
    var url = this.buildUrl(path, pathParams);
    var request = superagent(httpMethod, url);

    // apply authentications
    this.applyAuthToRequest(request, authNames);

    // set collection query parameters
    for (var key in collectionQueryParams) {
      if (collectionQueryParams.hasOwnProperty(key)) {
        var param = collectionQueryParams[key];
        if (param.collectionFormat === 'csv') {
          // SuperAgent normally percent-encodes all reserved characters in a query parameter. However,
          // commas are used as delimiters for the 'csv' collectionFormat so they must not be encoded. We
          // must therefore construct and encode 'csv' collection query parameters manually.
          if (param.value != null) {
            var value = param.value.map(this.paramToString).map(encodeURIComponent).join(',');
            request.query(encodeURIComponent(key) + "=" + value);
          }
        } else {
          // All other collection query parameters should be treated as ordinary query parameters.
          queryParams[key] = this.buildCollectionParam(param.value, param.collectionFormat);
        }
      }
    }

    // set query parameters
    if (httpMethod.toUpperCase() === 'GET' && this.cache === false) {
        queryParams['_'] = new Date().getTime();
    }
    request.query(this.normalizeParams(queryParams));

    // set header parameters
    request.set(this.defaultHeaders).set(this.normalizeParams(headerParams));


    // set requestAgent if it is set by user
    if (this.requestAgent) {
      request.agent(this.requestAgent);
    }

    // set request timeout
    request.timeout(this.timeout);

    var contentType = this.jsonPreferredMime(contentTypes);
    if (contentType) {
      // Issue with superagent and multipart/form-data (https://github.com/visionmedia/superagent/issues/746)
      if(contentType != 'multipart/form-data') {
        request.type(contentType);
      }
    } else if (!request.header['Content-Type']) {
      request.type('application/json');
    }

    if (contentType === 'application/x-www-form-urlencoded') {
      request.send(querystring.stringify(this.normalizeParams(formParams)));
    } else if (contentType == 'multipart/form-data') {
      var _formParams = this.normalizeParams(formParams);
      for (var key in _formParams) {
        if (_formParams.hasOwnProperty(key)) {
          if (this.isFileParam(_formParams[key])) {
            // file field
            request.attach(key, _formParams[key]);
          } else {
            request.field(key, _formParams[key]);
          }
        }
      }
    } else if (bodyParam) {
      request.send(bodyParam);
    }

    var accept = this.jsonPreferredMime(accepts);
    if (accept) {
      request.accept(accept);
    }

    if (returnType === 'Blob') {
      request.responseType('blob');
    } else if (returnType === 'String') {
      request.responseType('string');
    }

    // Attach previously saved cookies, if enabled
    if (this.enableCookies){
      if (typeof window === 'undefined') {
        this.agent.attachCookies(request);
      }
      else {
        request.withCredentials();
      }
    }


    request.end(function(error, response) {
      if (callback) {
        var data = null;
        if (!error) {
          try {
            data = _this.deserialize(response, returnType);
            if (_this.enableCookies && typeof window === 'undefined'){
              _this.agent.saveCookies(response);
            }
          } catch (err) {
            error = err;
          }
        }
        callback(error, data, response);
      }
    });

    return request;
  };

  /**
   * Parses an ISO-8601 string representation of a date value.
   * @param {String} str The date value as a string.
   * @returns {Date} The parsed date object.
   */
  exports.parseDate = function(str) {
    return new Date(str.replace(/T/i, ' '));
  };

  /**
   * Converts a value to the specified type.
   * @param {(String|Object)} data The data to convert, as a string or object.
   * @param {(String|Array.<String>|Object.<String, Object>|Function)} type The type to return. Pass a string for simple types
   * or the constructor function for a complex type. Pass an array containing the type name to return an array of that type. To
   * return an object, pass an object with one property whose name is the key type and whose value is the corresponding value type:
   * all properties on <code>data<code> will be converted to this type.
   * @returns An instance of the specified type or null or undefined if data is null or undefined.
   */
  exports.convertToType = function(data, type) {
    if (data === null || data === undefined)
      return data

    switch (type) {
      case 'Boolean':
        return Boolean(data);
      case 'Integer':
        return parseInt(data, 10);
      case 'Number':
        return parseFloat(data);
      case 'String':
        return String(data);
      case 'Date':
        return this.parseDate(String(data));
      case 'Blob':
      	return data;
      default:
        if (type === Object) {
          // generic object, return directly
          return data;
        } else if (typeof type === 'function') {
          // for model type like: User
          return type.constructFromObject(data);
        } else if (Array.isArray(type)) {
          // for array type like: ['String']
          var itemType = type[0];
          return data.map(function(item) {
            return exports.convertToType(item, itemType);
          });
        } else if (typeof type === 'object') {
          // for plain object type like: {'String': 'Integer'}
          var keyType, valueType;
          for (var k in type) {
            if (type.hasOwnProperty(k)) {
              keyType = k;
              valueType = type[k];
              break;
            }
          }
          var result = {};
          for (var k in data) {
            if (data.hasOwnProperty(k)) {
              var key = exports.convertToType(k, keyType);
              var value = exports.convertToType(data[k], valueType);
              result[key] = value;
            }
          }
          return result;
        } else {
          // for unknown type, return the data directly
          return data;
        }
    }
  };

  /**
   * Constructs a new map or array model from REST data.
   * @param data {Object|Array} The REST data.
   * @param obj {Object|Array} The target object or array.
   */
  exports.constructFromObject = function(data, obj, itemType) {
    if (Array.isArray(data)) {
      for (var i = 0; i < data.length; i++) {
        if (data.hasOwnProperty(i))
          obj[i] = exports.convertToType(data[i], itemType);
      }
    } else {
      for (var k in data) {
        if (data.hasOwnProperty(k))
          obj[k] = exports.convertToType(data[k], itemType);
      }
    }
  };

  /**
   * The default API client implementation.
   * @type {module:ApiClient}
   */
  exports.instance = new exports();

  return exports;
}));

}).call(this,require("buffer").Buffer)
},{"buffer":67,"fs":66,"querystring":71,"superagent":2}],10:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Address = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Address model module.
   * @module com.kodfarki.subscreasy.client.model/Address
   * @version 1.0
   */

  /**
   * Constructs a new <code>Address</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Address
   * @class
   */
  var exports = function() {
    var _this = this;








  };

  /**
   * Constructs a <code>Address</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Address} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Address} The populated <code>Address</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('city')) {
        obj['city'] = ApiClient.convertToType(data['city'], 'String');
      }
      if (data.hasOwnProperty('country')) {
        obj['country'] = ApiClient.convertToType(data['country'], 'String');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
      if (data.hasOwnProperty('postalCode')) {
        obj['postalCode'] = ApiClient.convertToType(data['postalCode'], 'String');
      }
      if (data.hasOwnProperty('stateProvince')) {
        obj['stateProvince'] = ApiClient.convertToType(data['stateProvince'], 'String');
      }
      if (data.hasOwnProperty('streetAddress')) {
        obj['streetAddress'] = ApiClient.convertToType(data['streetAddress'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {String} city
   */
  exports.prototype['city'] = undefined;
  /**
   * @member {String} country
   */
  exports.prototype['country'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;
  /**
   * @member {String} postalCode
   */
  exports.prototype['postalCode'] = undefined;
  /**
   * @member {String} stateProvince
   */
  exports.prototype['stateProvince'] = undefined;
  /**
   * @member {String} streetAddress
   */
  exports.prototype['streetAddress'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],11:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Authority = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Authority model module.
   * @module com.kodfarki.subscreasy.client.model/Authority
   * @version 1.0
   */

  /**
   * Constructs a new <code>Authority</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Authority
   * @class
   * @param name {String} 
   */
  var exports = function(name) {
    var _this = this;

    _this['name'] = name;
  };

  /**
   * Constructs a <code>Authority</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Authority} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Authority} The populated <code>Authority</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],12:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Authorization = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Authorization model module.
   * @module com.kodfarki.subscreasy.client.model/Authorization
   * @version 1.0
   */

  /**
   * Constructs a new <code>Authorization</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Authorization
   * @class
   */
  var exports = function() {
    var _this = this;



  };

  /**
   * Constructs a <code>Authorization</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Authorization} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Authorization} The populated <code>Authorization</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('serviceId')) {
        obj['serviceId'] = ApiClient.convertToType(data['serviceId'], 'Number');
      }
      if (data.hasOwnProperty('serviceUserId')) {
        obj['serviceUserId'] = ApiClient.convertToType(data['serviceUserId'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {Number} serviceId
   */
  exports.prototype['serviceId'] = undefined;
  /**
   * @member {String} serviceUserId
   */
  exports.prototype['serviceUserId'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],13:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/ServiceInstance'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./ServiceInstance'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.AuthorizedServicesResponse = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.ServiceInstance);
  }
}(this, function(ApiClient, ServiceInstance) {
  'use strict';




  /**
   * The AuthorizedServicesResponse model module.
   * @module com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse
   * @version 1.0
   */

  /**
   * Constructs a new <code>AuthorizedServicesResponse</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse
   * @class
   */
  var exports = function() {
    var _this = this;


  };

  /**
   * Constructs a <code>AuthorizedServicesResponse</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse} The populated <code>AuthorizedServicesResponse</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('services')) {
        obj['services'] = ApiClient.convertToType(data['services'], [ServiceInstance]);
      }
    }
    return obj;
  }

  /**
   * @member {Array.<module:com.kodfarki.subscreasy.client.model/ServiceInstance>} services
   */
  exports.prototype['services'] = undefined;



  return exports;
}));



},{"../ApiClient":9,"./ServiceInstance":33}],14:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Cancellation = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Cancellation model module.
   * @module com.kodfarki.subscreasy.client.model/Cancellation
   * @version 1.0
   */

  /**
   * Constructs a new <code>Cancellation</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Cancellation
   * @class
   */
  var exports = function() {
    var _this = this;



  };

  /**
   * Constructs a <code>Cancellation</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Cancellation} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Cancellation} The populated <code>Cancellation</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('cancellationType')) {
        obj['cancellationType'] = ApiClient.convertToType(data['cancellationType'], 'String');
      }
      if (data.hasOwnProperty('subscriptionId')) {
        obj['subscriptionId'] = ApiClient.convertToType(data['subscriptionId'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Cancellation.CancellationTypeEnum} cancellationType
   */
  exports.prototype['cancellationType'] = undefined;
  /**
   * @member {Number} subscriptionId
   */
  exports.prototype['subscriptionId'] = undefined;


  /**
   * Allowed values for the <code>cancellationType</code> property.
   * @enum {String}
   * @readonly
   */
  exports.CancellationTypeEnum = {
    /**
     * value: "IMMEDIATE"
     * @const
     */
    "IMMEDIATE": "IMMEDIATE",
    /**
     * value: "ENDOFTHEPERIOD"
     * @const
     */
    "ENDOFTHEPERIOD": "ENDOFTHEPERIOD"  };


  return exports;
}));



},{"../ApiClient":9}],15:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/ChargingLog'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./ChargingLog'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ChargingLog = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.ChargingLog);
  }
}(this, function(ApiClient, ChargingLog) {
  'use strict';




  /**
   * The ChargingLog model module.
   * @module com.kodfarki.subscreasy.client.model/ChargingLog
   * @version 1.0
   */

  /**
   * Constructs a new <code>ChargingLog</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/ChargingLog
   * @class
   */
  var exports = function() {
    var _this = this;





















  };

  /**
   * Constructs a <code>ChargingLog</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/ChargingLog} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/ChargingLog} The populated <code>ChargingLog</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('appliedCoupon')) {
        obj['appliedCoupon'] = ApiClient.convertToType(data['appliedCoupon'], 'Number');
      }
      if (data.hasOwnProperty('authCode')) {
        obj['authCode'] = ApiClient.convertToType(data['authCode'], 'String');
      }
      if (data.hasOwnProperty('companyId')) {
        obj['companyId'] = ApiClient.convertToType(data['companyId'], 'Number');
      }
      if (data.hasOwnProperty('createDate')) {
        obj['createDate'] = ApiClient.convertToType(data['createDate'], 'Date');
      }
      if (data.hasOwnProperty('currency')) {
        obj['currency'] = ApiClient.convertToType(data['currency'], 'String');
      }
      if (data.hasOwnProperty('errorCode')) {
        obj['errorCode'] = ApiClient.convertToType(data['errorCode'], 'String');
      }
      if (data.hasOwnProperty('errorText')) {
        obj['errorText'] = ApiClient.convertToType(data['errorText'], 'String');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('invoiceId')) {
        obj['invoiceId'] = ApiClient.convertToType(data['invoiceId'], 'Number');
      }
      if (data.hasOwnProperty('jobId')) {
        obj['jobId'] = ApiClient.convertToType(data['jobId'], 'Number');
      }
      if (data.hasOwnProperty('parent')) {
        obj['parent'] = ChargingLog.constructFromObject(data['parent']);
      }
      if (data.hasOwnProperty('paymentGateway')) {
        obj['paymentGateway'] = ApiClient.convertToType(data['paymentGateway'], 'String');
      }
      if (data.hasOwnProperty('paymentId')) {
        obj['paymentId'] = ApiClient.convertToType(data['paymentId'], 'String');
      }
      if (data.hasOwnProperty('price')) {
        obj['price'] = ApiClient.convertToType(data['price'], 'Number');
      }
      if (data.hasOwnProperty('reason')) {
        obj['reason'] = ApiClient.convertToType(data['reason'], 'String');
      }
      if (data.hasOwnProperty('serviceInstanceId')) {
        obj['serviceInstanceId'] = ApiClient.convertToType(data['serviceInstanceId'], 'Number');
      }
      if (data.hasOwnProperty('status')) {
        obj['status'] = ApiClient.convertToType(data['status'], 'String');
      }
      if (data.hasOwnProperty('subscriberSecureId')) {
        obj['subscriberSecureId'] = ApiClient.convertToType(data['subscriberSecureId'], 'String');
      }
      if (data.hasOwnProperty('subscriptionId')) {
        obj['subscriptionId'] = ApiClient.convertToType(data['subscriptionId'], 'Number');
      }
      if (data.hasOwnProperty('transactionId')) {
        obj['transactionId'] = ApiClient.convertToType(data['transactionId'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {Number} appliedCoupon
   */
  exports.prototype['appliedCoupon'] = undefined;
  /**
   * @member {String} authCode
   */
  exports.prototype['authCode'] = undefined;
  /**
   * @member {Number} companyId
   */
  exports.prototype['companyId'] = undefined;
  /**
   * @member {Date} createDate
   */
  exports.prototype['createDate'] = undefined;
  /**
   * @member {String} currency
   */
  exports.prototype['currency'] = undefined;
  /**
   * @member {String} errorCode
   */
  exports.prototype['errorCode'] = undefined;
  /**
   * @member {String} errorText
   */
  exports.prototype['errorText'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {Number} invoiceId
   */
  exports.prototype['invoiceId'] = undefined;
  /**
   * @member {Number} jobId
   */
  exports.prototype['jobId'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ChargingLog} parent
   */
  exports.prototype['parent'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ChargingLog.PaymentGatewayEnum} paymentGateway
   */
  exports.prototype['paymentGateway'] = undefined;
  /**
   * @member {String} paymentId
   */
  exports.prototype['paymentId'] = undefined;
  /**
   * @member {Number} price
   */
  exports.prototype['price'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ChargingLog.ReasonEnum} reason
   */
  exports.prototype['reason'] = undefined;
  /**
   * @member {Number} serviceInstanceId
   */
  exports.prototype['serviceInstanceId'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ChargingLog.StatusEnum} status
   */
  exports.prototype['status'] = undefined;
  /**
   * @member {String} subscriberSecureId
   */
  exports.prototype['subscriberSecureId'] = undefined;
  /**
   * @member {Number} subscriptionId
   */
  exports.prototype['subscriptionId'] = undefined;
  /**
   * @member {String} transactionId
   */
  exports.prototype['transactionId'] = undefined;


  /**
   * Allowed values for the <code>paymentGateway</code> property.
   * @enum {String}
   * @readonly
   */
  exports.PaymentGatewayEnum = {
    /**
     * value: "OFFLINE"
     * @const
     */
    "OFFLINE": "OFFLINE",
    /**
     * value: "IYZICO"
     * @const
     */
    "IYZICO": "IYZICO",
    /**
     * value: "PAYU"
     * @const
     */
    "PAYU": "PAYU"  };

  /**
   * Allowed values for the <code>reason</code> property.
   * @enum {String}
   * @readonly
   */
  exports.ReasonEnum = {
    /**
     * value: "START"
     * @const
     */
    "START": "START",
    /**
     * value: "RENEWAL"
     * @const
     */
    "RENEWAL": "RENEWAL",
    /**
     * value: "OVER_USAGE"
     * @const
     */
    "OVER_USAGE": "OVER_USAGE",
    /**
     * value: "REFUND"
     * @const
     */
    "REFUND": "REFUND"  };

  /**
   * Allowed values for the <code>status</code> property.
   * @enum {String}
   * @readonly
   */
  exports.StatusEnum = {
    /**
     * value: "NOT_PAID"
     * @const
     */
    "NOT_PAID": "NOT_PAID",
    /**
     * value: "SUCCESS"
     * @const
     */
    "SUCCESS": "SUCCESS",
    /**
     * value: "FAIL"
     * @const
     */
    "FAIL": "FAIL",
    /**
     * value: "REFUNDED"
     * @const
     */
    "REFUNDED": "REFUNDED"  };


  return exports;
}));



},{"../ApiClient":9,"./ChargingLog":15}],16:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Address'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Address'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Company = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Address);
  }
}(this, function(ApiClient, Address) {
  'use strict';




  /**
   * The Company model module.
   * @module com.kodfarki.subscreasy.client.model/Company
   * @version 1.0
   */

  /**
   * Constructs a new <code>Company</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Company
   * @class
   * @param name {String} 
   */
  var exports = function(name) {
    var _this = this;



    _this['name'] = name;
  };

  /**
   * Constructs a <code>Company</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Company} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Company} The populated <code>Company</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('address')) {
        obj['address'] = Address.constructFromObject(data['address']);
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Address} address
   */
  exports.prototype['address'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;



  return exports;
}));



},{"../ApiClient":9,"./Address":10}],17:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Company'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.CompanyProps = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company);
  }
}(this, function(ApiClient, Company) {
  'use strict';




  /**
   * The CompanyProps model module.
   * @module com.kodfarki.subscreasy.client.model/CompanyProps
   * @version 1.0
   */

  /**
   * Constructs a new <code>CompanyProps</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/CompanyProps
   * @class
   */
  var exports = function() {
    var _this = this;









  };

  /**
   * Constructs a <code>CompanyProps</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/CompanyProps} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/CompanyProps} The populated <code>CompanyProps</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('apiKey')) {
        obj['apiKey'] = ApiClient.convertToType(data['apiKey'], 'String');
      }
      if (data.hasOwnProperty('callbackUrl')) {
        obj['callbackUrl'] = ApiClient.convertToType(data['callbackUrl'], 'String');
      }
      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('paymentGatewayApiKey')) {
        obj['paymentGatewayApiKey'] = ApiClient.convertToType(data['paymentGatewayApiKey'], 'String');
      }
      if (data.hasOwnProperty('paymentGatewaySecurityKey')) {
        obj['paymentGatewaySecurityKey'] = ApiClient.convertToType(data['paymentGatewaySecurityKey'], 'String');
      }
      if (data.hasOwnProperty('paymentMethod')) {
        obj['paymentMethod'] = ApiClient.convertToType(data['paymentMethod'], 'String');
      }
      if (data.hasOwnProperty('secureKey')) {
        obj['secureKey'] = ApiClient.convertToType(data['secureKey'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {String} apiKey
   */
  exports.prototype['apiKey'] = undefined;
  /**
   * @member {String} callbackUrl
   */
  exports.prototype['callbackUrl'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} paymentGatewayApiKey
   */
  exports.prototype['paymentGatewayApiKey'] = undefined;
  /**
   * @member {String} paymentGatewaySecurityKey
   */
  exports.prototype['paymentGatewaySecurityKey'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/CompanyProps.PaymentMethodEnum} paymentMethod
   */
  exports.prototype['paymentMethod'] = undefined;
  /**
   * @member {String} secureKey
   */
  exports.prototype['secureKey'] = undefined;


  /**
   * Allowed values for the <code>paymentMethod</code> property.
   * @enum {String}
   * @readonly
   */
  exports.PaymentMethodEnum = {
    /**
     * value: "OFFLINE"
     * @const
     */
    "OFFLINE": "OFFLINE",
    /**
     * value: "IYZICO"
     * @const
     */
    "IYZICO": "IYZICO",
    /**
     * value: "PAYU"
     * @const
     */
    "PAYU": "PAYU"  };


  return exports;
}));



},{"../ApiClient":9,"./Company":16}],18:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Company'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Coupon = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company);
  }
}(this, function(ApiClient, Company) {
  'use strict';




  /**
   * The Coupon model module.
   * @module com.kodfarki.subscreasy.client.model/Coupon
   * @version 1.0
   */

  /**
   * Constructs a new <code>Coupon</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Coupon
   * @class
   * @param discountAmount {Number} 
   * @param discountType {module:com.kodfarki.subscreasy.client.model/Coupon.DiscountTypeEnum} 
   * @param maxLimit {Number} 
   */
  var exports = function(discountAmount, discountType, maxLimit) {
    var _this = this;




    _this['discountAmount'] = discountAmount;
    _this['discountType'] = discountType;


    _this['maxLimit'] = maxLimit;
  };

  /**
   * Constructs a <code>Coupon</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Coupon} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Coupon} The populated <code>Coupon</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('code')) {
        obj['code'] = ApiClient.convertToType(data['code'], 'String');
      }
      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('currentUsage')) {
        obj['currentUsage'] = ApiClient.convertToType(data['currentUsage'], 'Number');
      }
      if (data.hasOwnProperty('discountAmount')) {
        obj['discountAmount'] = ApiClient.convertToType(data['discountAmount'], 'Number');
      }
      if (data.hasOwnProperty('discountType')) {
        obj['discountType'] = ApiClient.convertToType(data['discountType'], 'String');
      }
      if (data.hasOwnProperty('expireDate')) {
        obj['expireDate'] = ApiClient.convertToType(data['expireDate'], 'Date');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('maxLimit')) {
        obj['maxLimit'] = ApiClient.convertToType(data['maxLimit'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {String} code
   */
  exports.prototype['code'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {Number} currentUsage
   */
  exports.prototype['currentUsage'] = undefined;
  /**
   * @member {Number} discountAmount
   */
  exports.prototype['discountAmount'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Coupon.DiscountTypeEnum} discountType
   */
  exports.prototype['discountType'] = undefined;
  /**
   * @member {Date} expireDate
   */
  exports.prototype['expireDate'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {Number} maxLimit
   */
  exports.prototype['maxLimit'] = undefined;


  /**
   * Allowed values for the <code>discountType</code> property.
   * @enum {String}
   * @readonly
   */
  exports.DiscountTypeEnum = {
    /**
     * value: "FIXED"
     * @const
     */
    "FIXED": "FIXED",
    /**
     * value: "PERCENTAGE"
     * @const
     */
    "PERCENTAGE": "PERCENTAGE"  };


  return exports;
}));



},{"../ApiClient":9,"./Company":16}],19:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Deduction = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Deduction model module.
   * @module com.kodfarki.subscreasy.client.model/Deduction
   * @version 1.0
   */

  /**
   * Constructs a new <code>Deduction</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Deduction
   * @class
   */
  var exports = function() {
    var _this = this;







  };

  /**
   * Constructs a <code>Deduction</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Deduction} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Deduction} The populated <code>Deduction</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('amount')) {
        obj['amount'] = ApiClient.convertToType(data['amount'], 'Number');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('serviceId')) {
        obj['serviceId'] = ApiClient.convertToType(data['serviceId'], 'Number');
      }
      if (data.hasOwnProperty('usageEndTime')) {
        obj['usageEndTime'] = ApiClient.convertToType(data['usageEndTime'], 'Date');
      }
      if (data.hasOwnProperty('usageStartTime')) {
        obj['usageStartTime'] = ApiClient.convertToType(data['usageStartTime'], 'Date');
      }
      if (data.hasOwnProperty('userId')) {
        obj['userId'] = ApiClient.convertToType(data['userId'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {Number} amount
   */
  exports.prototype['amount'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {Number} serviceId
   */
  exports.prototype['serviceId'] = undefined;
  /**
   * @member {Date} usageEndTime
   */
  exports.prototype['usageEndTime'] = undefined;
  /**
   * @member {Date} usageStartTime
   */
  exports.prototype['usageStartTime'] = undefined;
  /**
   * @member {String} userId
   */
  exports.prototype['userId'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],20:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.DeductionResult = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The DeductionResult model module.
   * @module com.kodfarki.subscreasy.client.model/DeductionResult
   * @version 1.0
   */

  /**
   * Constructs a new <code>DeductionResult</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/DeductionResult
   * @class
   */
  var exports = function() {
    var _this = this;







  };

  /**
   * Constructs a <code>DeductionResult</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/DeductionResult} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/DeductionResult} The populated <code>DeductionResult</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('capacity')) {
        obj['capacity'] = ApiClient.convertToType(data['capacity'], 'Number');
      }
      if (data.hasOwnProperty('consumedResourceId')) {
        obj['consumedResourceId'] = ApiClient.convertToType(data['consumedResourceId'], 'Number');
      }
      if (data.hasOwnProperty('overUsage')) {
        obj['overUsage'] = ApiClient.convertToType(data['overUsage'], 'Number');
      }
      if (data.hasOwnProperty('requestedAmount')) {
        obj['requestedAmount'] = ApiClient.convertToType(data['requestedAmount'], 'Number');
      }
      if (data.hasOwnProperty('subscriptionId')) {
        obj['subscriptionId'] = ApiClient.convertToType(data['subscriptionId'], 'Number');
      }
      if (data.hasOwnProperty('usage')) {
        obj['usage'] = ApiClient.convertToType(data['usage'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {Number} capacity
   */
  exports.prototype['capacity'] = undefined;
  /**
   * @member {Number} consumedResourceId
   */
  exports.prototype['consumedResourceId'] = undefined;
  /**
   * @member {Number} overUsage
   */
  exports.prototype['overUsage'] = undefined;
  /**
   * @member {Number} requestedAmount
   */
  exports.prototype['requestedAmount'] = undefined;
  /**
   * @member {Number} subscriptionId
   */
  exports.prototype['subscriptionId'] = undefined;
  /**
   * @member {Number} usage
   */
  exports.prototype['usage'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],21:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Subsription'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Subsription'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.History = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Subsription);
  }
}(this, function(ApiClient, Subsription) {
  'use strict';




  /**
   * The History model module.
   * @module com.kodfarki.subscreasy.client.model/History
   * @version 1.0
   */

  /**
   * Constructs a new <code>History</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/History
   * @class
   */
  var exports = function() {
    var _this = this;




  };

  /**
   * Constructs a <code>History</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/History} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/History} The populated <code>History</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
      if (data.hasOwnProperty('subscription')) {
        obj['subscription'] = Subsription.constructFromObject(data['subscription']);
      }
    }
    return obj;
  }

  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/History.NameEnum} name
   */
  exports.prototype['name'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Subsription} subscription
   */
  exports.prototype['subscription'] = undefined;


  /**
   * Allowed values for the <code>name</code> property.
   * @enum {String}
   * @readonly
   */
  exports.NameEnum = {
    /**
     * value: "STARTED"
     * @const
     */
    "STARTED": "STARTED",
    /**
     * value: "RENEWED"
     * @const
     */
    "RENEWED": "RENEWED",
    /**
     * value: "FINISHED"
     * @const
     */
    "FINISHED": "FINISHED",
    /**
     * value: "CANCELLED"
     * @const
     */
    "CANCELLED": "CANCELLED"  };


  return exports;
}));



},{"../ApiClient":9,"./Subsription":41}],22:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Invoice = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Invoice model module.
   * @module com.kodfarki.subscreasy.client.model/Invoice
   * @version 1.0
   */

  /**
   * Constructs a new <code>Invoice</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Invoice
   * @class
   */
  var exports = function() {
    var _this = this;









  };

  /**
   * Constructs a <code>Invoice</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Invoice} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Invoice} The populated <code>Invoice</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('amount')) {
        obj['amount'] = ApiClient.convertToType(data['amount'], 'Number');
      }
      if (data.hasOwnProperty('billingMonth')) {
        obj['billingMonth'] = ApiClient.convertToType(data['billingMonth'], 'Number');
      }
      if (data.hasOwnProperty('billingYear')) {
        obj['billingYear'] = ApiClient.convertToType(data['billingYear'], 'Number');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('periodEnd')) {
        obj['periodEnd'] = ApiClient.convertToType(data['periodEnd'], 'Date');
      }
      if (data.hasOwnProperty('periodStart')) {
        obj['periodStart'] = ApiClient.convertToType(data['periodStart'], 'Date');
      }
      if (data.hasOwnProperty('status')) {
        obj['status'] = ApiClient.convertToType(data['status'], 'String');
      }
      if (data.hasOwnProperty('subscriberSecureId')) {
        obj['subscriberSecureId'] = ApiClient.convertToType(data['subscriberSecureId'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {Number} amount
   */
  exports.prototype['amount'] = undefined;
  /**
   * @member {Number} billingMonth
   */
  exports.prototype['billingMonth'] = undefined;
  /**
   * @member {Number} billingYear
   */
  exports.prototype['billingYear'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {Date} periodEnd
   */
  exports.prototype['periodEnd'] = undefined;
  /**
   * @member {Date} periodStart
   */
  exports.prototype['periodStart'] = undefined;
  /**
   * @member {String} status
   */
  exports.prototype['status'] = undefined;
  /**
   * @member {String} subscriberSecureId
   */
  exports.prototype['subscriberSecureId'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],23:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.InvoiceRequest = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The InvoiceRequest model module.
   * @module com.kodfarki.subscreasy.client.model/InvoiceRequest
   * @version 1.0
   */

  /**
   * Constructs a new <code>InvoiceRequest</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/InvoiceRequest
   * @class
   */
  var exports = function() {
    var _this = this;




  };

  /**
   * Constructs a <code>InvoiceRequest</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/InvoiceRequest} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/InvoiceRequest} The populated <code>InvoiceRequest</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('customerId')) {
        obj['customerId'] = ApiClient.convertToType(data['customerId'], 'Number');
      }
      if (data.hasOwnProperty('selectedDate')) {
        obj['selectedDate'] = ApiClient.convertToType(data['selectedDate'], 'Date');
      }
      if (data.hasOwnProperty('serviceUserId')) {
        obj['serviceUserId'] = ApiClient.convertToType(data['serviceUserId'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {Number} customerId
   */
  exports.prototype['customerId'] = undefined;
  /**
   * @member {Date} selectedDate
   */
  exports.prototype['selectedDate'] = undefined;
  /**
   * @member {Number} serviceUserId
   */
  exports.prototype['serviceUserId'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],24:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Company'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ManagedUserVM = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company);
  }
}(this, function(ApiClient, Company) {
  'use strict';




  /**
   * The ManagedUserVM model module.
   * @module com.kodfarki.subscreasy.client.model/ManagedUserVM
   * @version 1.0
   */

  /**
   * Constructs a new <code>ManagedUserVM</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/ManagedUserVM
   * @class
   * @param login {String} 
   */
  var exports = function(login) {
    var _this = this;














    _this['login'] = login;


  };

  /**
   * Constructs a <code>ManagedUserVM</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/ManagedUserVM} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/ManagedUserVM} The populated <code>ManagedUserVM</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('activated')) {
        obj['activated'] = ApiClient.convertToType(data['activated'], 'Boolean');
      }
      if (data.hasOwnProperty('authorities')) {
        obj['authorities'] = ApiClient.convertToType(data['authorities'], ['String']);
      }
      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('createdBy')) {
        obj['createdBy'] = ApiClient.convertToType(data['createdBy'], 'String');
      }
      if (data.hasOwnProperty('createdDate')) {
        obj['createdDate'] = ApiClient.convertToType(data['createdDate'], 'Date');
      }
      if (data.hasOwnProperty('email')) {
        obj['email'] = ApiClient.convertToType(data['email'], 'String');
      }
      if (data.hasOwnProperty('firstName')) {
        obj['firstName'] = ApiClient.convertToType(data['firstName'], 'String');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('imageUrl')) {
        obj['imageUrl'] = ApiClient.convertToType(data['imageUrl'], 'String');
      }
      if (data.hasOwnProperty('langKey')) {
        obj['langKey'] = ApiClient.convertToType(data['langKey'], 'String');
      }
      if (data.hasOwnProperty('lastModifiedBy')) {
        obj['lastModifiedBy'] = ApiClient.convertToType(data['lastModifiedBy'], 'String');
      }
      if (data.hasOwnProperty('lastModifiedDate')) {
        obj['lastModifiedDate'] = ApiClient.convertToType(data['lastModifiedDate'], 'Date');
      }
      if (data.hasOwnProperty('lastName')) {
        obj['lastName'] = ApiClient.convertToType(data['lastName'], 'String');
      }
      if (data.hasOwnProperty('login')) {
        obj['login'] = ApiClient.convertToType(data['login'], 'String');
      }
      if (data.hasOwnProperty('password')) {
        obj['password'] = ApiClient.convertToType(data['password'], 'String');
      }
      if (data.hasOwnProperty('resetDate')) {
        obj['resetDate'] = ApiClient.convertToType(data['resetDate'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {Boolean} activated
   */
  exports.prototype['activated'] = undefined;
  /**
   * @member {Array.<String>} authorities
   */
  exports.prototype['authorities'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {String} createdBy
   */
  exports.prototype['createdBy'] = undefined;
  /**
   * @member {Date} createdDate
   */
  exports.prototype['createdDate'] = undefined;
  /**
   * @member {String} email
   */
  exports.prototype['email'] = undefined;
  /**
   * @member {String} firstName
   */
  exports.prototype['firstName'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} imageUrl
   */
  exports.prototype['imageUrl'] = undefined;
  /**
   * @member {String} langKey
   */
  exports.prototype['langKey'] = undefined;
  /**
   * @member {String} lastModifiedBy
   */
  exports.prototype['lastModifiedBy'] = undefined;
  /**
   * @member {Date} lastModifiedDate
   */
  exports.prototype['lastModifiedDate'] = undefined;
  /**
   * @member {String} lastName
   */
  exports.prototype['lastName'] = undefined;
  /**
   * @member {String} login
   */
  exports.prototype['login'] = undefined;
  /**
   * @member {String} password
   */
  exports.prototype['password'] = undefined;
  /**
   * @member {String} resetDate
   */
  exports.prototype['resetDate'] = undefined;



  return exports;
}));



},{"../ApiClient":9,"./Company":16}],25:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Company'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.MessageTemplate = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company);
  }
}(this, function(ApiClient, Company) {
  'use strict';




  /**
   * The MessageTemplate model module.
   * @module com.kodfarki.subscreasy.client.model/MessageTemplate
   * @version 1.0
   */

  /**
   * Constructs a new <code>MessageTemplate</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/MessageTemplate
   * @class
   * @param company {module:com.kodfarki.subscreasy.client.model/Company} 
   */
  var exports = function(company) {
    var _this = this;

    _this['company'] = company;







  };

  /**
   * Constructs a <code>MessageTemplate</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/MessageTemplate} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/MessageTemplate} The populated <code>MessageTemplate</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('enabled')) {
        obj['enabled'] = ApiClient.convertToType(data['enabled'], 'Boolean');
      }
      if (data.hasOwnProperty('eventType')) {
        obj['eventType'] = ApiClient.convertToType(data['eventType'], 'String');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('messageTemplate')) {
        obj['messageTemplate'] = ApiClient.convertToType(data['messageTemplate'], 'String');
      }
      if (data.hasOwnProperty('notificationType')) {
        obj['notificationType'] = ApiClient.convertToType(data['notificationType'], 'String');
      }
      if (data.hasOwnProperty('sender')) {
        obj['sender'] = ApiClient.convertToType(data['sender'], 'String');
      }
      if (data.hasOwnProperty('subject')) {
        obj['subject'] = ApiClient.convertToType(data['subject'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {Boolean} enabled
   */
  exports.prototype['enabled'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/MessageTemplate.EventTypeEnum} eventType
   */
  exports.prototype['eventType'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} messageTemplate
   */
  exports.prototype['messageTemplate'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/MessageTemplate.NotificationTypeEnum} notificationType
   */
  exports.prototype['notificationType'] = undefined;
  /**
   * @member {String} sender
   */
  exports.prototype['sender'] = undefined;
  /**
   * @member {String} subject
   */
  exports.prototype['subject'] = undefined;


  /**
   * Allowed values for the <code>eventType</code> property.
   * @enum {String}
   * @readonly
   */
  exports.EventTypeEnum = {
    /**
     * value: "STARTED"
     * @const
     */
    "STARTED": "STARTED",
    /**
     * value: "RENEWED"
     * @const
     */
    "RENEWED": "RENEWED",
    /**
     * value: "FINISHED"
     * @const
     */
    "FINISHED": "FINISHED",
    /**
     * value: "CANCELLED"
     * @const
     */
    "CANCELLED": "CANCELLED"  };

  /**
   * Allowed values for the <code>notificationType</code> property.
   * @enum {String}
   * @readonly
   */
  exports.NotificationTypeEnum = {
    /**
     * value: "WEBHOOK"
     * @const
     */
    "WEBHOOK": "WEBHOOK",
    /**
     * value: "EMAIL"
     * @const
     */
    "EMAIL": "EMAIL"  };


  return exports;
}));



},{"../ApiClient":9,"./Company":16}],26:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company', 'com.kodfarki.subscreasy.client.model/RecurrencePeriod'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Company'), require('./RecurrencePeriod'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Offer = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company, root.ApiDocumentation.RecurrencePeriod);
  }
}(this, function(ApiClient, Company, RecurrencePeriod) {
  'use strict';




  /**
   * The Offer model module.
   * @module com.kodfarki.subscreasy.client.model/Offer
   * @version 1.0
   */

  /**
   * Constructs a new <code>Offer</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Offer
   * @class
   * @param company {module:com.kodfarki.subscreasy.client.model/Company} 
   * @param name {String} 
   * @param openEnded {Boolean} 
   * @param price {Number} 
   * @param recurrence {module:com.kodfarki.subscreasy.client.model/RecurrencePeriod} 
   */
  var exports = function(company, name, openEnded, price, recurrence) {
    var _this = this;

    _this['company'] = company;

    _this['name'] = name;
    _this['openEnded'] = openEnded;
    _this['price'] = price;
    _this['recurrence'] = recurrence;



  };

  /**
   * Constructs a <code>Offer</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Offer} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Offer} The populated <code>Offer</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
      if (data.hasOwnProperty('openEnded')) {
        obj['openEnded'] = ApiClient.convertToType(data['openEnded'], 'Boolean');
      }
      if (data.hasOwnProperty('price')) {
        obj['price'] = ApiClient.convertToType(data['price'], 'Number');
      }
      if (data.hasOwnProperty('recurrence')) {
        obj['recurrence'] = RecurrencePeriod.constructFromObject(data['recurrence']);
      }
      if (data.hasOwnProperty('recurrenceCount')) {
        obj['recurrenceCount'] = ApiClient.convertToType(data['recurrenceCount'], 'Number');
      }
      if (data.hasOwnProperty('secureId')) {
        obj['secureId'] = ApiClient.convertToType(data['secureId'], 'String');
      }
      if (data.hasOwnProperty('trialPeriod')) {
        obj['trialPeriod'] = ApiClient.convertToType(data['trialPeriod'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;
  /**
   * @member {Boolean} openEnded
   */
  exports.prototype['openEnded'] = undefined;
  /**
   * @member {Number} price
   */
  exports.prototype['price'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/RecurrencePeriod} recurrence
   */
  exports.prototype['recurrence'] = undefined;
  /**
   * @member {Number} recurrenceCount
   */
  exports.prototype['recurrenceCount'] = undefined;
  /**
   * @member {String} secureId
   */
  exports.prototype['secureId'] = undefined;
  /**
   * @member {Number} trialPeriod
   */
  exports.prototype['trialPeriod'] = undefined;



  return exports;
}));



},{"../ApiClient":9,"./Company":16,"./RecurrencePeriod":29}],27:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.PaymentCard = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The PaymentCard model module.
   * @module com.kodfarki.subscreasy.client.model/PaymentCard
   * @version 1.0
   */

  /**
   * Constructs a new <code>PaymentCard</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/PaymentCard
   * @class
   */
  var exports = function() {
    var _this = this;











  };

  /**
   * Constructs a <code>PaymentCard</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/PaymentCard} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/PaymentCard} The populated <code>PaymentCard</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('cardAlias')) {
        obj['cardAlias'] = ApiClient.convertToType(data['cardAlias'], 'String');
      }
      if (data.hasOwnProperty('cardExpiry')) {
        obj['cardExpiry'] = ApiClient.convertToType(data['cardExpiry'], 'String');
      }
      if (data.hasOwnProperty('cardHolderName')) {
        obj['cardHolderName'] = ApiClient.convertToType(data['cardHolderName'], 'String');
      }
      if (data.hasOwnProperty('cardNumber')) {
        obj['cardNumber'] = ApiClient.convertToType(data['cardNumber'], 'String');
      }
      if (data.hasOwnProperty('cardToken')) {
        obj['cardToken'] = ApiClient.convertToType(data['cardToken'], 'String');
      }
      if (data.hasOwnProperty('cardUserKey')) {
        obj['cardUserKey'] = ApiClient.convertToType(data['cardUserKey'], 'String');
      }
      if (data.hasOwnProperty('cvc')) {
        obj['cvc'] = ApiClient.convertToType(data['cvc'], 'String');
      }
      if (data.hasOwnProperty('expireMonth')) {
        obj['expireMonth'] = ApiClient.convertToType(data['expireMonth'], 'String');
      }
      if (data.hasOwnProperty('expireYear')) {
        obj['expireYear'] = ApiClient.convertToType(data['expireYear'], 'String');
      }
      if (data.hasOwnProperty('registerCard')) {
        obj['registerCard'] = ApiClient.convertToType(data['registerCard'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {String} cardAlias
   */
  exports.prototype['cardAlias'] = undefined;
  /**
   * @member {String} cardExpiry
   */
  exports.prototype['cardExpiry'] = undefined;
  /**
   * @member {String} cardHolderName
   */
  exports.prototype['cardHolderName'] = undefined;
  /**
   * @member {String} cardNumber
   */
  exports.prototype['cardNumber'] = undefined;
  /**
   * @member {String} cardToken
   */
  exports.prototype['cardToken'] = undefined;
  /**
   * @member {String} cardUserKey
   */
  exports.prototype['cardUserKey'] = undefined;
  /**
   * @member {String} cvc
   */
  exports.prototype['cvc'] = undefined;
  /**
   * @member {String} expireMonth
   */
  exports.prototype['expireMonth'] = undefined;
  /**
   * @member {String} expireYear
   */
  exports.prototype['expireYear'] = undefined;
  /**
   * @member {Number} registerCard
   */
  exports.prototype['registerCard'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],28:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ProfileInfoVM = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The ProfileInfoVM model module.
   * @module com.kodfarki.subscreasy.client.model/ProfileInfoVM
   * @version 1.0
   */

  /**
   * Constructs a new <code>ProfileInfoVM</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/ProfileInfoVM
   * @class
   */
  var exports = function() {
    var _this = this;



  };

  /**
   * Constructs a <code>ProfileInfoVM</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/ProfileInfoVM} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/ProfileInfoVM} The populated <code>ProfileInfoVM</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('activeProfiles')) {
        obj['activeProfiles'] = ApiClient.convertToType(data['activeProfiles'], ['String']);
      }
      if (data.hasOwnProperty('ribbonEnv')) {
        obj['ribbonEnv'] = ApiClient.convertToType(data['ribbonEnv'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {Array.<String>} activeProfiles
   */
  exports.prototype['activeProfiles'] = undefined;
  /**
   * @member {String} ribbonEnv
   */
  exports.prototype['ribbonEnv'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],29:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.RecurrencePeriod = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The RecurrencePeriod model module.
   * @module com.kodfarki.subscreasy.client.model/RecurrencePeriod
   * @version 1.0
   */

  /**
   * Constructs a new <code>RecurrencePeriod</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/RecurrencePeriod
   * @class
   * @param length {Number} 
   * @param recurrenceType {module:com.kodfarki.subscreasy.client.model/RecurrencePeriod.RecurrenceTypeEnum} 
   */
  var exports = function(length, recurrenceType) {
    var _this = this;


    _this['length'] = length;
    _this['recurrenceType'] = recurrenceType;
  };

  /**
   * Constructs a <code>RecurrencePeriod</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/RecurrencePeriod} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/RecurrencePeriod} The populated <code>RecurrencePeriod</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('length')) {
        obj['length'] = ApiClient.convertToType(data['length'], 'Number');
      }
      if (data.hasOwnProperty('recurrenceType')) {
        obj['recurrenceType'] = ApiClient.convertToType(data['recurrenceType'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {Number} length
   */
  exports.prototype['length'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/RecurrencePeriod.RecurrenceTypeEnum} recurrenceType
   */
  exports.prototype['recurrenceType'] = undefined;


  /**
   * Allowed values for the <code>recurrenceType</code> property.
   * @enum {String}
   * @readonly
   */
  exports.RecurrenceTypeEnum = {
    /**
     * value: "SECONDLY"
     * @const
     */
    "SECONDLY": "SECONDLY",
    /**
     * value: "MINUTELY"
     * @const
     */
    "MINUTELY": "MINUTELY",
    /**
     * value: "HOURLY"
     * @const
     */
    "HOURLY": "HOURLY",
    /**
     * value: "DAILY"
     * @const
     */
    "DAILY": "DAILY",
    /**
     * value: "WEEKLY"
     * @const
     */
    "WEEKLY": "WEEKLY",
    /**
     * value: "MONTHLY"
     * @const
     */
    "MONTHLY": "MONTHLY",
    /**
     * value: "YEARLY"
     * @const
     */
    "YEARLY": "YEARLY"  };


  return exports;
}));



},{"../ApiClient":9}],30:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ResponseEntity = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The ResponseEntity model module.
   * @module com.kodfarki.subscreasy.client.model/ResponseEntity
   * @version 1.0
   */

  /**
   * Constructs a new <code>ResponseEntity</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/ResponseEntity
   * @class
   */
  var exports = function() {
    var _this = this;




  };

  /**
   * Constructs a <code>ResponseEntity</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/ResponseEntity} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/ResponseEntity} The populated <code>ResponseEntity</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('body')) {
        obj['body'] = ApiClient.convertToType(data['body'], Object);
      }
      if (data.hasOwnProperty('statusCode')) {
        obj['statusCode'] = ApiClient.convertToType(data['statusCode'], 'String');
      }
      if (data.hasOwnProperty('statusCodeValue')) {
        obj['statusCodeValue'] = ApiClient.convertToType(data['statusCodeValue'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {Object} body
   */
  exports.prototype['body'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ResponseEntity.StatusCodeEnum} statusCode
   */
  exports.prototype['statusCode'] = undefined;
  /**
   * @member {Number} statusCodeValue
   */
  exports.prototype['statusCodeValue'] = undefined;


  /**
   * Allowed values for the <code>statusCode</code> property.
   * @enum {String}
   * @readonly
   */
  exports.StatusCodeEnum = {
    /**
     * value: "100"
     * @const
     */
    "100": "100",
    /**
     * value: "101"
     * @const
     */
    "101": "101",
    /**
     * value: "102"
     * @const
     */
    "102": "102",
    /**
     * value: "103"
     * @const
     */
    "103": "103",
    /**
     * value: "200"
     * @const
     */
    "200": "200",
    /**
     * value: "201"
     * @const
     */
    "201": "201",
    /**
     * value: "202"
     * @const
     */
    "202": "202",
    /**
     * value: "203"
     * @const
     */
    "203": "203",
    /**
     * value: "204"
     * @const
     */
    "204": "204",
    /**
     * value: "205"
     * @const
     */
    "205": "205",
    /**
     * value: "206"
     * @const
     */
    "206": "206",
    /**
     * value: "207"
     * @const
     */
    "207": "207",
    /**
     * value: "208"
     * @const
     */
    "208": "208",
    /**
     * value: "226"
     * @const
     */
    "226": "226",
    /**
     * value: "300"
     * @const
     */
    "300": "300",
    /**
     * value: "301"
     * @const
     */
    "301": "301",
    /**
     * value: "302"
     * @const
     */
    "302": "302",
    /**
     * value: "303"
     * @const
     */
    "303": "303",
    /**
     * value: "304"
     * @const
     */
    "304": "304",
    /**
     * value: "305"
     * @const
     */
    "305": "305",
    /**
     * value: "307"
     * @const
     */
    "307": "307",
    /**
     * value: "308"
     * @const
     */
    "308": "308",
    /**
     * value: "400"
     * @const
     */
    "400": "400",
    /**
     * value: "401"
     * @const
     */
    "401": "401",
    /**
     * value: "402"
     * @const
     */
    "402": "402",
    /**
     * value: "403"
     * @const
     */
    "403": "403",
    /**
     * value: "404"
     * @const
     */
    "404": "404",
    /**
     * value: "405"
     * @const
     */
    "405": "405",
    /**
     * value: "406"
     * @const
     */
    "406": "406",
    /**
     * value: "407"
     * @const
     */
    "407": "407",
    /**
     * value: "408"
     * @const
     */
    "408": "408",
    /**
     * value: "409"
     * @const
     */
    "409": "409",
    /**
     * value: "410"
     * @const
     */
    "410": "410",
    /**
     * value: "411"
     * @const
     */
    "411": "411",
    /**
     * value: "412"
     * @const
     */
    "412": "412",
    /**
     * value: "413"
     * @const
     */
    "413": "413",
    /**
     * value: "414"
     * @const
     */
    "414": "414",
    /**
     * value: "415"
     * @const
     */
    "415": "415",
    /**
     * value: "416"
     * @const
     */
    "416": "416",
    /**
     * value: "417"
     * @const
     */
    "417": "417",
    /**
     * value: "418"
     * @const
     */
    "418": "418",
    /**
     * value: "419"
     * @const
     */
    "419": "419",
    /**
     * value: "420"
     * @const
     */
    "420": "420",
    /**
     * value: "421"
     * @const
     */
    "421": "421",
    /**
     * value: "422"
     * @const
     */
    "422": "422",
    /**
     * value: "423"
     * @const
     */
    "423": "423",
    /**
     * value: "424"
     * @const
     */
    "424": "424",
    /**
     * value: "426"
     * @const
     */
    "426": "426",
    /**
     * value: "428"
     * @const
     */
    "428": "428",
    /**
     * value: "429"
     * @const
     */
    "429": "429",
    /**
     * value: "431"
     * @const
     */
    "431": "431",
    /**
     * value: "451"
     * @const
     */
    "451": "451",
    /**
     * value: "500"
     * @const
     */
    "500": "500",
    /**
     * value: "501"
     * @const
     */
    "501": "501",
    /**
     * value: "502"
     * @const
     */
    "502": "502",
    /**
     * value: "503"
     * @const
     */
    "503": "503",
    /**
     * value: "504"
     * @const
     */
    "504": "504",
    /**
     * value: "505"
     * @const
     */
    "505": "505",
    /**
     * value: "506"
     * @const
     */
    "506": "506",
    /**
     * value: "507"
     * @const
     */
    "507": "507",
    /**
     * value: "508"
     * @const
     */
    "508": "508",
    /**
     * value: "509"
     * @const
     */
    "509": "509",
    /**
     * value: "510"
     * @const
     */
    "510": "510",
    /**
     * value: "511"
     * @const
     */
    "511": "511"  };


  return exports;
}));



},{"../ApiClient":9}],31:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.SavedCard = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The SavedCard model module.
   * @module com.kodfarki.subscreasy.client.model/SavedCard
   * @version 1.0
   */

  /**
   * Constructs a new <code>SavedCard</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/SavedCard
   * @class
   */
  var exports = function() {
    var _this = this;











  };

  /**
   * Constructs a <code>SavedCard</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/SavedCard} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/SavedCard} The populated <code>SavedCard</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('binNumber')) {
        obj['binNumber'] = ApiClient.convertToType(data['binNumber'], 'String');
      }
      if (data.hasOwnProperty('cardAlias')) {
        obj['cardAlias'] = ApiClient.convertToType(data['cardAlias'], 'String');
      }
      if (data.hasOwnProperty('cardAssociation')) {
        obj['cardAssociation'] = ApiClient.convertToType(data['cardAssociation'], 'String');
      }
      if (data.hasOwnProperty('cardBankCode')) {
        obj['cardBankCode'] = ApiClient.convertToType(data['cardBankCode'], 'Number');
      }
      if (data.hasOwnProperty('cardBankName')) {
        obj['cardBankName'] = ApiClient.convertToType(data['cardBankName'], 'String');
      }
      if (data.hasOwnProperty('cardFamily')) {
        obj['cardFamily'] = ApiClient.convertToType(data['cardFamily'], 'String');
      }
      if (data.hasOwnProperty('cardToken')) {
        obj['cardToken'] = ApiClient.convertToType(data['cardToken'], 'String');
      }
      if (data.hasOwnProperty('cardUserKey')) {
        obj['cardUserKey'] = ApiClient.convertToType(data['cardUserKey'], 'String');
      }
      if (data.hasOwnProperty('cartType')) {
        obj['cartType'] = ApiClient.convertToType(data['cartType'], 'String');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {String} binNumber
   */
  exports.prototype['binNumber'] = undefined;
  /**
   * @member {String} cardAlias
   */
  exports.prototype['cardAlias'] = undefined;
  /**
   * @member {String} cardAssociation
   */
  exports.prototype['cardAssociation'] = undefined;
  /**
   * @member {Number} cardBankCode
   */
  exports.prototype['cardBankCode'] = undefined;
  /**
   * @member {String} cardBankName
   */
  exports.prototype['cardBankName'] = undefined;
  /**
   * @member {String} cardFamily
   */
  exports.prototype['cardFamily'] = undefined;
  /**
   * @member {String} cardToken
   */
  exports.prototype['cardToken'] = undefined;
  /**
   * @member {String} cardUserKey
   */
  exports.prototype['cardUserKey'] = undefined;
  /**
   * @member {String} cartType
   */
  exports.prototype['cartType'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],32:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Company'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Service = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company);
  }
}(this, function(ApiClient, Company) {
  'use strict';




  /**
   * The Service model module.
   * @module com.kodfarki.subscreasy.client.model/Service
   * @version 1.0
   */

  /**
   * Constructs a new <code>Service</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Service
   * @class
   * @param company {module:com.kodfarki.subscreasy.client.model/Company} 
   * @param name {String} 
   * @param type {module:com.kodfarki.subscreasy.client.model/Service.TypeEnum} 
   */
  var exports = function(company, name, type) {
    var _this = this;

    _this['company'] = company;

    _this['name'] = name;
    _this['type'] = type;
  };

  /**
   * Constructs a <code>Service</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Service} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Service} The populated <code>Service</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
      if (data.hasOwnProperty('type')) {
        obj['type'] = ApiClient.convertToType(data['type'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Service.TypeEnum} type
   */
  exports.prototype['type'] = undefined;


  /**
   * Allowed values for the <code>type</code> property.
   * @enum {String}
   * @readonly
   */
  exports.TypeEnum = {
    /**
     * value: "ONOFF"
     * @const
     */
    "ONOFF": "ONOFF",
    /**
     * value: "SEAT_BASED"
     * @const
     */
    "SEAT_BASED": "SEAT_BASED",
    /**
     * value: "USAGE_BASED"
     * @const
     */
    "USAGE_BASED": "USAGE_BASED"  };


  return exports;
}));



},{"../ApiClient":9,"./Company":16}],33:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Offer', 'com.kodfarki.subscreasy.client.model/ServiceOffering', 'com.kodfarki.subscreasy.client.model/Subsription'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Offer'), require('./ServiceOffering'), require('./Subsription'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ServiceInstance = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Offer, root.ApiDocumentation.ServiceOffering, root.ApiDocumentation.Subsription);
  }
}(this, function(ApiClient, Offer, ServiceOffering, Subsription) {
  'use strict';




  /**
   * The ServiceInstance model module.
   * @module com.kodfarki.subscreasy.client.model/ServiceInstance
   * @version 1.0
   */

  /**
   * Constructs a new <code>ServiceInstance</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/ServiceInstance
   * @class
   */
  var exports = function() {
    var _this = this;



















  };

  /**
   * Constructs a <code>ServiceInstance</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/ServiceInstance} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/ServiceInstance} The populated <code>ServiceInstance</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('capacity')) {
        obj['capacity'] = ApiClient.convertToType(data['capacity'], 'Number');
      }
      if (data.hasOwnProperty('currentUsage')) {
        obj['currentUsage'] = ApiClient.convertToType(data['currentUsage'], 'Number');
      }
      if (data.hasOwnProperty('endDate')) {
        obj['endDate'] = ApiClient.convertToType(data['endDate'], 'Date');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
      if (data.hasOwnProperty('numberOfUnits')) {
        obj['numberOfUnits'] = ApiClient.convertToType(data['numberOfUnits'], 'Number');
      }
      if (data.hasOwnProperty('offer')) {
        obj['offer'] = Offer.constructFromObject(data['offer']);
      }
      if (data.hasOwnProperty('overUsage')) {
        obj['overUsage'] = ApiClient.convertToType(data['overUsage'], 'Number');
      }
      if (data.hasOwnProperty('overUsageQuota')) {
        obj['overUsageQuota'] = ApiClient.convertToType(data['overUsageQuota'], 'Number');
      }
      if (data.hasOwnProperty('quotaOrigin')) {
        obj['quotaOrigin'] = ApiClient.convertToType(data['quotaOrigin'], 'String');
      }
      if (data.hasOwnProperty('serviceOffering')) {
        obj['serviceOffering'] = ServiceOffering.constructFromObject(data['serviceOffering']);
      }
      if (data.hasOwnProperty('serviceType')) {
        obj['serviceType'] = ApiClient.convertToType(data['serviceType'], 'String');
      }
      if (data.hasOwnProperty('startDate')) {
        obj['startDate'] = ApiClient.convertToType(data['startDate'], 'Date');
      }
      if (data.hasOwnProperty('status')) {
        obj['status'] = ApiClient.convertToType(data['status'], 'String');
      }
      if (data.hasOwnProperty('subscriberId')) {
        obj['subscriberId'] = ApiClient.convertToType(data['subscriberId'], 'String');
      }
      if (data.hasOwnProperty('subscription')) {
        obj['subscription'] = Subsription.constructFromObject(data['subscription']);
      }
      if (data.hasOwnProperty('type')) {
        obj['type'] = ApiClient.convertToType(data['type'], 'String');
      }
      if (data.hasOwnProperty('version')) {
        obj['version'] = ApiClient.convertToType(data['version'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {Number} capacity
   */
  exports.prototype['capacity'] = undefined;
  /**
   * @member {Number} currentUsage
   */
  exports.prototype['currentUsage'] = undefined;
  /**
   * @member {Date} endDate
   */
  exports.prototype['endDate'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;
  /**
   * @member {Number} numberOfUnits
   */
  exports.prototype['numberOfUnits'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Offer} offer
   */
  exports.prototype['offer'] = undefined;
  /**
   * @member {Number} overUsage
   */
  exports.prototype['overUsage'] = undefined;
  /**
   * @member {Number} overUsageQuota
   */
  exports.prototype['overUsageQuota'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ServiceInstance.QuotaOriginEnum} quotaOrigin
   */
  exports.prototype['quotaOrigin'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ServiceOffering} serviceOffering
   */
  exports.prototype['serviceOffering'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ServiceInstance.ServiceTypeEnum} serviceType
   */
  exports.prototype['serviceType'] = undefined;
  /**
   * @member {Date} startDate
   */
  exports.prototype['startDate'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ServiceInstance.StatusEnum} status
   */
  exports.prototype['status'] = undefined;
  /**
   * @member {String} subscriberId
   */
  exports.prototype['subscriberId'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Subsription} subscription
   */
  exports.prototype['subscription'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ServiceInstance.TypeEnum} type
   */
  exports.prototype['type'] = undefined;
  /**
   * @member {Number} version
   */
  exports.prototype['version'] = undefined;


  /**
   * Allowed values for the <code>quotaOrigin</code> property.
   * @enum {String}
   * @readonly
   */
  exports.QuotaOriginEnum = {
    /**
     * value: "SUBS"
     * @const
     */
    "SUBS": "SUBS",
    /**
     * value: "OVER"
     * @const
     */
    "OVER": "OVER"  };

  /**
   * Allowed values for the <code>serviceType</code> property.
   * @enum {String}
   * @readonly
   */
  exports.ServiceTypeEnum = {
    /**
     * value: "ONOFF"
     * @const
     */
    "ONOFF": "ONOFF",
    /**
     * value: "SEAT_BASED"
     * @const
     */
    "SEAT_BASED": "SEAT_BASED",
    /**
     * value: "USAGE_BASED"
     * @const
     */
    "USAGE_BASED": "USAGE_BASED"  };

  /**
   * Allowed values for the <code>status</code> property.
   * @enum {String}
   * @readonly
   */
  exports.StatusEnum = {
    /**
     * value: "NEW"
     * @const
     */
    "NEW": "NEW",
    /**
     * value: "ACTIVE"
     * @const
     */
    "ACTIVE": "ACTIVE",
    /**
     * value: "SUSPENDED"
     * @const
     */
    "SUSPENDED": "SUSPENDED",
    /**
     * value: "FINISHED"
     * @const
     */
    "FINISHED": "FINISHED",
    /**
     * value: "CANCELLED"
     * @const
     */
    "CANCELLED": "CANCELLED"  };

  /**
   * Allowed values for the <code>type</code> property.
   * @enum {String}
   * @readonly
   */
  exports.TypeEnum = {
    /**
     * value: "ONOFF"
     * @const
     */
    "ONOFF": "ONOFF",
    /**
     * value: "SEAT_BASED"
     * @const
     */
    "SEAT_BASED": "SEAT_BASED",
    /**
     * value: "USAGE_BASED"
     * @const
     */
    "USAGE_BASED": "USAGE_BASED"  };


  return exports;
}));



},{"../ApiClient":9,"./Offer":26,"./ServiceOffering":35,"./Subsription":41}],34:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ServiceInstanceResult = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The ServiceInstanceResult model module.
   * @module com.kodfarki.subscreasy.client.model/ServiceInstanceResult
   * @version 1.0
   */

  /**
   * Constructs a new <code>ServiceInstanceResult</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/ServiceInstanceResult
   * @class
   */
  var exports = function() {
    var _this = this;








  };

  /**
   * Constructs a <code>ServiceInstanceResult</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/ServiceInstanceResult} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/ServiceInstanceResult} The populated <code>ServiceInstanceResult</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('capacity')) {
        obj['capacity'] = ApiClient.convertToType(data['capacity'], 'Number');
      }
      if (data.hasOwnProperty('endDate')) {
        obj['endDate'] = ApiClient.convertToType(data['endDate'], 'Date');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
      if (data.hasOwnProperty('overUsage')) {
        obj['overUsage'] = ApiClient.convertToType(data['overUsage'], 'Number');
      }
      if (data.hasOwnProperty('type')) {
        obj['type'] = ApiClient.convertToType(data['type'], 'String');
      }
      if (data.hasOwnProperty('usage')) {
        obj['usage'] = ApiClient.convertToType(data['usage'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {Number} capacity
   */
  exports.prototype['capacity'] = undefined;
  /**
   * @member {Date} endDate
   */
  exports.prototype['endDate'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;
  /**
   * @member {Number} overUsage
   */
  exports.prototype['overUsage'] = undefined;
  /**
   * @member {String} type
   */
  exports.prototype['type'] = undefined;
  /**
   * @member {Number} usage
   */
  exports.prototype['usage'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],35:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company', 'com.kodfarki.subscreasy.client.model/Offer', 'com.kodfarki.subscreasy.client.model/Service'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Company'), require('./Offer'), require('./Service'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ServiceOffering = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company, root.ApiDocumentation.Offer, root.ApiDocumentation.Service);
  }
}(this, function(ApiClient, Company, Offer, Service) {
  'use strict';




  /**
   * The ServiceOffering model module.
   * @module com.kodfarki.subscreasy.client.model/ServiceOffering
   * @version 1.0
   */

  /**
   * Constructs a new <code>ServiceOffering</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/ServiceOffering
   * @class
   * @param offer {module:com.kodfarki.subscreasy.client.model/Offer} 
   * @param quotaAmount {Number} 
   */
  var exports = function(offer, quotaAmount) {
    var _this = this;




    _this['offer'] = offer;



    _this['quotaAmount'] = quotaAmount;


  };

  /**
   * Constructs a <code>ServiceOffering</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/ServiceOffering} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/ServiceOffering} The populated <code>ServiceOffering</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('description')) {
        obj['description'] = ApiClient.convertToType(data['description'], 'String');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('offer')) {
        obj['offer'] = Offer.constructFromObject(data['offer']);
      }
      if (data.hasOwnProperty('overUsagePrice')) {
        obj['overUsagePrice'] = ApiClient.convertToType(data['overUsagePrice'], 'Number');
      }
      if (data.hasOwnProperty('overUsageQuota')) {
        obj['overUsageQuota'] = ApiClient.convertToType(data['overUsageQuota'], 'Number');
      }
      if (data.hasOwnProperty('price')) {
        obj['price'] = ApiClient.convertToType(data['price'], 'Number');
      }
      if (data.hasOwnProperty('quotaAmount')) {
        obj['quotaAmount'] = ApiClient.convertToType(data['quotaAmount'], 'Number');
      }
      if (data.hasOwnProperty('service')) {
        obj['service'] = Service.constructFromObject(data['service']);
      }
      if (data.hasOwnProperty('unitName')) {
        obj['unitName'] = ApiClient.convertToType(data['unitName'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {String} description
   */
  exports.prototype['description'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Offer} offer
   */
  exports.prototype['offer'] = undefined;
  /**
   * @member {Number} overUsagePrice
   */
  exports.prototype['overUsagePrice'] = undefined;
  /**
   * @member {Number} overUsageQuota
   */
  exports.prototype['overUsageQuota'] = undefined;
  /**
   * @member {Number} price
   */
  exports.prototype['price'] = undefined;
  /**
   * @member {Number} quotaAmount
   */
  exports.prototype['quotaAmount'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Service} service
   */
  exports.prototype['service'] = undefined;
  /**
   * @member {String} unitName
   */
  exports.prototype['unitName'] = undefined;



  return exports;
}));



},{"../ApiClient":9,"./Company":16,"./Offer":26,"./Service":32}],36:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ServiceOfferingResult = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The ServiceOfferingResult model module.
   * @module com.kodfarki.subscreasy.client.model/ServiceOfferingResult
   * @version 1.0
   */

  /**
   * Constructs a new <code>ServiceOfferingResult</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/ServiceOfferingResult
   * @class
   */
  var exports = function() {
    var _this = this;








  };

  /**
   * Constructs a <code>ServiceOfferingResult</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/ServiceOfferingResult} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/ServiceOfferingResult} The populated <code>ServiceOfferingResult</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('capacity')) {
        obj['capacity'] = ApiClient.convertToType(data['capacity'], 'String');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
      if (data.hasOwnProperty('price')) {
        obj['price'] = ApiClient.convertToType(data['price'], 'Number');
      }
      if (data.hasOwnProperty('type')) {
        obj['type'] = ApiClient.convertToType(data['type'], 'String');
      }
      if (data.hasOwnProperty('unitName')) {
        obj['unitName'] = ApiClient.convertToType(data['unitName'], 'String');
      }
      if (data.hasOwnProperty('unitsPerPrice')) {
        obj['unitsPerPrice'] = ApiClient.convertToType(data['unitsPerPrice'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {String} capacity
   */
  exports.prototype['capacity'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;
  /**
   * @member {Number} price
   */
  exports.prototype['price'] = undefined;
  /**
   * @member {String} type
   */
  exports.prototype['type'] = undefined;
  /**
   * @member {String} unitName
   */
  exports.prototype['unitName'] = undefined;
  /**
   * @member {Number} unitsPerPrice
   */
  exports.prototype['unitsPerPrice'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],37:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/PaymentCard', 'com.kodfarki.subscreasy.client.model/Subscriber', 'com.kodfarki.subscreasy.client.model/SubscriptionPlan'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./PaymentCard'), require('./Subscriber'), require('./SubscriptionPlan'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.StartSubscriptionRequest = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.PaymentCard, root.ApiDocumentation.Subscriber, root.ApiDocumentation.SubscriptionPlan);
  }
}(this, function(ApiClient, PaymentCard, Subscriber, SubscriptionPlan) {
  'use strict';




  /**
   * The StartSubscriptionRequest model module.
   * @module com.kodfarki.subscreasy.client.model/StartSubscriptionRequest
   * @version 1.0
   */

  /**
   * Constructs a new <code>StartSubscriptionRequest</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/StartSubscriptionRequest
   * @class
   */
  var exports = function() {
    var _this = this;







  };

  /**
   * Constructs a <code>StartSubscriptionRequest</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/StartSubscriptionRequest} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/StartSubscriptionRequest} The populated <code>StartSubscriptionRequest</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('apiKey')) {
        obj['apiKey'] = ApiClient.convertToType(data['apiKey'], 'String');
      }
      if (data.hasOwnProperty('callbackUrl')) {
        obj['callbackUrl'] = ApiClient.convertToType(data['callbackUrl'], 'String');
      }
      if (data.hasOwnProperty('couponCode')) {
        obj['couponCode'] = ApiClient.convertToType(data['couponCode'], 'String');
      }
      if (data.hasOwnProperty('offer')) {
        obj['offer'] = SubscriptionPlan.constructFromObject(data['offer']);
      }
      if (data.hasOwnProperty('paymentCard')) {
        obj['paymentCard'] = PaymentCard.constructFromObject(data['paymentCard']);
      }
      if (data.hasOwnProperty('subscriber')) {
        obj['subscriber'] = Subscriber.constructFromObject(data['subscriber']);
      }
    }
    return obj;
  }

  /**
   * @member {String} apiKey
   */
  exports.prototype['apiKey'] = undefined;
  /**
   * @member {String} callbackUrl
   */
  exports.prototype['callbackUrl'] = undefined;
  /**
   * @member {String} couponCode
   */
  exports.prototype['couponCode'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/SubscriptionPlan} offer
   */
  exports.prototype['offer'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/PaymentCard} paymentCard
   */
  exports.prototype['paymentCard'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Subscriber} subscriber
   */
  exports.prototype['subscriber'] = undefined;



  return exports;
}));



},{"../ApiClient":9,"./PaymentCard":27,"./Subscriber":38,"./SubscriptionPlan":40}],38:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Subscriber = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Subscriber model module.
   * @module com.kodfarki.subscreasy.client.model/Subscriber
   * @version 1.0
   */

  /**
   * Constructs a new <code>Subscriber</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Subscriber
   * @class
   */
  var exports = function() {
    var _this = this;




















  };

  /**
   * Constructs a <code>Subscriber</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Subscriber} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Subscriber} The populated <code>Subscriber</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('address')) {
        obj['address'] = ApiClient.convertToType(data['address'], 'String');
      }
      if (data.hasOwnProperty('city')) {
        obj['city'] = ApiClient.convertToType(data['city'], 'String');
      }
      if (data.hasOwnProperty('country')) {
        obj['country'] = ApiClient.convertToType(data['country'], 'String');
      }
      if (data.hasOwnProperty('email')) {
        obj['email'] = ApiClient.convertToType(data['email'], 'String');
      }
      if (data.hasOwnProperty('gsmNumber')) {
        obj['gsmNumber'] = ApiClient.convertToType(data['gsmNumber'], 'String');
      }
      if (data.hasOwnProperty('identityNumber')) {
        obj['identityNumber'] = ApiClient.convertToType(data['identityNumber'], 'String');
      }
      if (data.hasOwnProperty('ip')) {
        obj['ip'] = ApiClient.convertToType(data['ip'], 'String');
      }
      if (data.hasOwnProperty('lastLoginDate')) {
        obj['lastLoginDate'] = ApiClient.convertToType(data['lastLoginDate'], 'String');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
      if (data.hasOwnProperty('registrationDate')) {
        obj['registrationDate'] = ApiClient.convertToType(data['registrationDate'], 'String');
      }
      if (data.hasOwnProperty('secureId')) {
        obj['secureId'] = ApiClient.convertToType(data['secureId'], 'String');
      }
      if (data.hasOwnProperty('shippingAddress')) {
        obj['shippingAddress'] = ApiClient.convertToType(data['shippingAddress'], 'String');
      }
      if (data.hasOwnProperty('shippingCity')) {
        obj['shippingCity'] = ApiClient.convertToType(data['shippingCity'], 'String');
      }
      if (data.hasOwnProperty('shippingCountry')) {
        obj['shippingCountry'] = ApiClient.convertToType(data['shippingCountry'], 'String');
      }
      if (data.hasOwnProperty('shippingName')) {
        obj['shippingName'] = ApiClient.convertToType(data['shippingName'], 'String');
      }
      if (data.hasOwnProperty('shippingZipCode')) {
        obj['shippingZipCode'] = ApiClient.convertToType(data['shippingZipCode'], 'String');
      }
      if (data.hasOwnProperty('surname')) {
        obj['surname'] = ApiClient.convertToType(data['surname'], 'String');
      }
      if (data.hasOwnProperty('useBillingAddressForShipping')) {
        obj['useBillingAddressForShipping'] = ApiClient.convertToType(data['useBillingAddressForShipping'], 'Boolean');
      }
      if (data.hasOwnProperty('zipCode')) {
        obj['zipCode'] = ApiClient.convertToType(data['zipCode'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {String} address
   */
  exports.prototype['address'] = undefined;
  /**
   * @member {String} city
   */
  exports.prototype['city'] = undefined;
  /**
   * @member {String} country
   */
  exports.prototype['country'] = undefined;
  /**
   * @member {String} email
   */
  exports.prototype['email'] = undefined;
  /**
   * @member {String} gsmNumber
   */
  exports.prototype['gsmNumber'] = undefined;
  /**
   * @member {String} identityNumber
   */
  exports.prototype['identityNumber'] = undefined;
  /**
   * @member {String} ip
   */
  exports.prototype['ip'] = undefined;
  /**
   * @member {String} lastLoginDate
   */
  exports.prototype['lastLoginDate'] = undefined;
  /**
   * @member {String} name
   */
  exports.prototype['name'] = undefined;
  /**
   * @member {String} registrationDate
   */
  exports.prototype['registrationDate'] = undefined;
  /**
   * @member {String} secureId
   */
  exports.prototype['secureId'] = undefined;
  /**
   * @member {String} shippingAddress
   */
  exports.prototype['shippingAddress'] = undefined;
  /**
   * @member {String} shippingCity
   */
  exports.prototype['shippingCity'] = undefined;
  /**
   * @member {String} shippingCountry
   */
  exports.prototype['shippingCountry'] = undefined;
  /**
   * @member {String} shippingName
   */
  exports.prototype['shippingName'] = undefined;
  /**
   * @member {String} shippingZipCode
   */
  exports.prototype['shippingZipCode'] = undefined;
  /**
   * @member {String} surname
   */
  exports.prototype['surname'] = undefined;
  /**
   * @member {Boolean} useBillingAddressForShipping
   */
  exports.prototype['useBillingAddressForShipping'] = undefined;
  /**
   * @member {String} zipCode
   */
  exports.prototype['zipCode'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],39:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/ChargingLog', 'com.kodfarki.subscreasy.client.model/Subsription'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./ChargingLog'), require('./Subsription'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.SubscriptionCreateResult = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.ChargingLog, root.ApiDocumentation.Subsription);
  }
}(this, function(ApiClient, ChargingLog, Subsription) {
  'use strict';




  /**
   * The SubscriptionCreateResult model module.
   * @module com.kodfarki.subscreasy.client.model/SubscriptionCreateResult
   * @version 1.0
   */

  /**
   * Constructs a new <code>SubscriptionCreateResult</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/SubscriptionCreateResult
   * @class
   */
  var exports = function() {
    var _this = this;



  };

  /**
   * Constructs a <code>SubscriptionCreateResult</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/SubscriptionCreateResult} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/SubscriptionCreateResult} The populated <code>SubscriptionCreateResult</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('payment')) {
        obj['payment'] = ChargingLog.constructFromObject(data['payment']);
      }
      if (data.hasOwnProperty('subscription')) {
        obj['subscription'] = Subsription.constructFromObject(data['subscription']);
      }
    }
    return obj;
  }

  /**
   * @member {module:com.kodfarki.subscreasy.client.model/ChargingLog} payment
   */
  exports.prototype['payment'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Subsription} subscription
   */
  exports.prototype['subscription'] = undefined;



  return exports;
}));



},{"../ApiClient":9,"./ChargingLog":15,"./Subsription":41}],40:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.SubscriptionPlan = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The SubscriptionPlan model module.
   * @module com.kodfarki.subscreasy.client.model/SubscriptionPlan
   * @version 1.0
   */

  /**
   * Constructs a new <code>SubscriptionPlan</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/SubscriptionPlan
   * @class
   */
  var exports = function() {
    var _this = this;



  };

  /**
   * Constructs a <code>SubscriptionPlan</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/SubscriptionPlan} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/SubscriptionPlan} The populated <code>SubscriptionPlan</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('secureId')) {
        obj['secureId'] = ApiClient.convertToType(data['secureId'], 'String');
      }
    }
    return obj;
  }

  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} secureId
   */
  exports.prototype['secureId'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],41:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company', 'com.kodfarki.subscreasy.client.model/Coupon', 'com.kodfarki.subscreasy.client.model/Offer', 'com.kodfarki.subscreasy.client.model/SavedCard', 'com.kodfarki.subscreasy.client.model/ServiceInstance'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Company'), require('./Coupon'), require('./Offer'), require('./SavedCard'), require('./ServiceInstance'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.Subsription = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company, root.ApiDocumentation.Coupon, root.ApiDocumentation.Offer, root.ApiDocumentation.SavedCard, root.ApiDocumentation.ServiceInstance);
  }
}(this, function(ApiClient, Company, Coupon, Offer, SavedCard, ServiceInstance) {
  'use strict';




  /**
   * The Subsription model module.
   * @module com.kodfarki.subscreasy.client.model/Subsription
   * @version 1.0
   */

  /**
   * Constructs a new <code>Subsription</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/Subsription
   * @class
   * @param company {module:com.kodfarki.subscreasy.client.model/Company} 
   * @param offer {module:com.kodfarki.subscreasy.client.model/Offer} 
   */
  var exports = function(company, offer) {
    var _this = this;




    _this['company'] = company;



    _this['offer'] = offer;





  };

  /**
   * Constructs a <code>Subsription</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/Subsription} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/Subsription} The populated <code>Subsription</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('appliedCoupon')) {
        obj['appliedCoupon'] = Coupon.constructFromObject(data['appliedCoupon']);
      }
      if (data.hasOwnProperty('cancelDate')) {
        obj['cancelDate'] = ApiClient.convertToType(data['cancelDate'], 'Date');
      }
      if (data.hasOwnProperty('card')) {
        obj['card'] = SavedCard.constructFromObject(data['card']);
      }
      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('endDate')) {
        obj['endDate'] = ApiClient.convertToType(data['endDate'], 'Date');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('nextChargingDate')) {
        obj['nextChargingDate'] = ApiClient.convertToType(data['nextChargingDate'], 'Date');
      }
      if (data.hasOwnProperty('offer')) {
        obj['offer'] = Offer.constructFromObject(data['offer']);
      }
      if (data.hasOwnProperty('services')) {
        obj['services'] = ApiClient.convertToType(data['services'], [ServiceInstance]);
      }
      if (data.hasOwnProperty('startDate')) {
        obj['startDate'] = ApiClient.convertToType(data['startDate'], 'Date');
      }
      if (data.hasOwnProperty('status')) {
        obj['status'] = ApiClient.convertToType(data['status'], 'String');
      }
      if (data.hasOwnProperty('subscriberId')) {
        obj['subscriberId'] = ApiClient.convertToType(data['subscriberId'], 'String');
      }
      if (data.hasOwnProperty('version')) {
        obj['version'] = ApiClient.convertToType(data['version'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Coupon} appliedCoupon
   */
  exports.prototype['appliedCoupon'] = undefined;
  /**
   * @member {Date} cancelDate
   */
  exports.prototype['cancelDate'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/SavedCard} card
   */
  exports.prototype['card'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {Date} endDate
   */
  exports.prototype['endDate'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {Date} nextChargingDate
   */
  exports.prototype['nextChargingDate'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Offer} offer
   */
  exports.prototype['offer'] = undefined;
  /**
   * @member {Array.<module:com.kodfarki.subscreasy.client.model/ServiceInstance>} services
   */
  exports.prototype['services'] = undefined;
  /**
   * @member {Date} startDate
   */
  exports.prototype['startDate'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Subsription.StatusEnum} status
   */
  exports.prototype['status'] = undefined;
  /**
   * @member {String} subscriberId
   */
  exports.prototype['subscriberId'] = undefined;
  /**
   * @member {Number} version
   */
  exports.prototype['version'] = undefined;


  /**
   * Allowed values for the <code>status</code> property.
   * @enum {String}
   * @readonly
   */
  exports.StatusEnum = {
    /**
     * value: "NEW"
     * @const
     */
    "NEW": "NEW",
    /**
     * value: "ACTIVE"
     * @const
     */
    "ACTIVE": "ACTIVE",
    /**
     * value: "SUSPENDED"
     * @const
     */
    "SUSPENDED": "SUSPENDED",
    /**
     * value: "FINISHED"
     * @const
     */
    "FINISHED": "FINISHED",
    /**
     * value: "CANCELLED"
     * @const
     */
    "CANCELLED": "CANCELLED"  };


  return exports;
}));



},{"../ApiClient":9,"./Company":16,"./Coupon":18,"./Offer":26,"./SavedCard":31,"./ServiceInstance":33}],42:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.UsageNotification = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The UsageNotification model module.
   * @module com.kodfarki.subscreasy.client.model/UsageNotification
   * @version 1.0
   */

  /**
   * Constructs a new <code>UsageNotification</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/UsageNotification
   * @class
   */
  var exports = function() {
    var _this = this;


  };

  /**
   * Constructs a <code>UsageNotification</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/UsageNotification} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/UsageNotification} The populated <code>UsageNotification</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
    }
    return obj;
  }

  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;



  return exports;
}));



},{"../ApiClient":9}],43:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Authority', 'com.kodfarki.subscreasy.client.model/Company'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Authority'), require('./Company'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.User = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Authority, root.ApiDocumentation.Company);
  }
}(this, function(ApiClient, Authority, Company) {
  'use strict';




  /**
   * The User model module.
   * @module com.kodfarki.subscreasy.client.model/User
   * @version 1.0
   */

  /**
   * Constructs a new <code>User</code>.
   * @alias module:com.kodfarki.subscreasy.client.model/User
   * @class
   * @param activated {Boolean} 
   * @param login {String} 
   */
  var exports = function(activated, login) {
    var _this = this;

    _this['activated'] = activated;










    _this['login'] = login;

  };

  /**
   * Constructs a <code>User</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:com.kodfarki.subscreasy.client.model/User} obj Optional instance to populate.
   * @return {module:com.kodfarki.subscreasy.client.model/User} The populated <code>User</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('activated')) {
        obj['activated'] = ApiClient.convertToType(data['activated'], 'Boolean');
      }
      if (data.hasOwnProperty('authorities')) {
        obj['authorities'] = ApiClient.convertToType(data['authorities'], [Authority]);
      }
      if (data.hasOwnProperty('company')) {
        obj['company'] = Company.constructFromObject(data['company']);
      }
      if (data.hasOwnProperty('createdDate')) {
        obj['createdDate'] = ApiClient.convertToType(data['createdDate'], 'Date');
      }
      if (data.hasOwnProperty('email')) {
        obj['email'] = ApiClient.convertToType(data['email'], 'String');
      }
      if (data.hasOwnProperty('firstName')) {
        obj['firstName'] = ApiClient.convertToType(data['firstName'], 'String');
      }
      if (data.hasOwnProperty('id')) {
        obj['id'] = ApiClient.convertToType(data['id'], 'Number');
      }
      if (data.hasOwnProperty('imageUrl')) {
        obj['imageUrl'] = ApiClient.convertToType(data['imageUrl'], 'String');
      }
      if (data.hasOwnProperty('langKey')) {
        obj['langKey'] = ApiClient.convertToType(data['langKey'], 'String');
      }
      if (data.hasOwnProperty('lastModifiedDate')) {
        obj['lastModifiedDate'] = ApiClient.convertToType(data['lastModifiedDate'], 'Date');
      }
      if (data.hasOwnProperty('lastName')) {
        obj['lastName'] = ApiClient.convertToType(data['lastName'], 'String');
      }
      if (data.hasOwnProperty('login')) {
        obj['login'] = ApiClient.convertToType(data['login'], 'String');
      }
      if (data.hasOwnProperty('resetDate')) {
        obj['resetDate'] = ApiClient.convertToType(data['resetDate'], 'Date');
      }
    }
    return obj;
  }

  /**
   * @member {Boolean} activated
   */
  exports.prototype['activated'] = undefined;
  /**
   * @member {Array.<module:com.kodfarki.subscreasy.client.model/Authority>} authorities
   */
  exports.prototype['authorities'] = undefined;
  /**
   * @member {module:com.kodfarki.subscreasy.client.model/Company} company
   */
  exports.prototype['company'] = undefined;
  /**
   * @member {Date} createdDate
   */
  exports.prototype['createdDate'] = undefined;
  /**
   * @member {String} email
   */
  exports.prototype['email'] = undefined;
  /**
   * @member {String} firstName
   */
  exports.prototype['firstName'] = undefined;
  /**
   * @member {Number} id
   */
  exports.prototype['id'] = undefined;
  /**
   * @member {String} imageUrl
   */
  exports.prototype['imageUrl'] = undefined;
  /**
   * @member {String} langKey
   */
  exports.prototype['langKey'] = undefined;
  /**
   * @member {Date} lastModifiedDate
   */
  exports.prototype['lastModifiedDate'] = undefined;
  /**
   * @member {String} lastName
   */
  exports.prototype['lastName'] = undefined;
  /**
   * @member {String} login
   */
  exports.prototype['login'] = undefined;
  /**
   * @member {Date} resetDate
   */
  exports.prototype['resetDate'] = undefined;



  return exports;
}));



},{"../ApiClient":9,"./Authority":11,"./Company":16}],44:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.AnalyticsResourceApi = factory(root.ApiDocumentation.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';

  /**
   * AnalyticsResource service.
   * @module com.kodfarki.subscreasy.client/AnalyticsResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new AnalyticsResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/AnalyticsResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the getDashboardAnalyticsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/AnalyticsResourceApi~getDashboardAnalyticsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Object} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getDashboardAnalytics
     * @param {module:com.kodfarki.subscreasy.client/AnalyticsResourceApi~getDashboardAnalyticsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Object}
     */
    this.getDashboardAnalyticsUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Object;

      return this.apiClient.callApi(
        '/api/analytics/dashboard', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9}],45:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/SavedCard'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/SavedCard'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.CardResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.SavedCard);
  }
}(this, function(ApiClient, SavedCard) {
  'use strict';

  /**
   * CardResource service.
   * @module com.kodfarki.subscreasy.client/CardResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new CardResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/CardResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createCardUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/CardResourceApi~createCardUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/SavedCard} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createCard
     * @param {module:com.kodfarki.subscreasy.client.model/SavedCard} card card
     * @param {module:com.kodfarki.subscreasy.client/CardResourceApi~createCardUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/SavedCard}
     */
    this.createCardUsingPOST = function(card, callback) {
      var postBody = card;

      // verify the required parameter 'card' is set
      if (card === undefined || card === null) {
        throw new Error("Missing the required parameter 'card' when calling createCardUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = SavedCard;

      return this.apiClient.callApi(
        '/api/cards', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteCardUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/CardResourceApi~deleteCardUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteCard
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/CardResourceApi~deleteCardUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteCardUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteCardUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/cards/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllCardsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/CardResourceApi~getAllCardsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/SavedCard>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllCards
     * @param {module:com.kodfarki.subscreasy.client/CardResourceApi~getAllCardsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/SavedCard>}
     */
    this.getAllCardsUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [SavedCard];

      return this.apiClient.callApi(
        '/api/cards', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getCardUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/CardResourceApi~getCardUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/SavedCard} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getCard
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/CardResourceApi~getCardUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/SavedCard}
     */
    this.getCardUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getCardUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = SavedCard;

      return this.apiClient.callApi(
        '/api/cards/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateCardUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/CardResourceApi~updateCardUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/SavedCard} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateCard
     * @param {module:com.kodfarki.subscreasy.client.model/SavedCard} card card
     * @param {module:com.kodfarki.subscreasy.client/CardResourceApi~updateCardUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/SavedCard}
     */
    this.updateCardUsingPUT = function(card, callback) {
      var postBody = card;

      // verify the required parameter 'card' is set
      if (card === undefined || card === null) {
        throw new Error("Missing the required parameter 'card' when calling updateCardUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = SavedCard;

      return this.apiClient.callApi(
        '/api/cards', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/SavedCard":31}],46:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/ChargingLog'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/ChargingLog'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ChargingLogResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.ChargingLog);
  }
}(this, function(ApiClient, ChargingLog) {
  'use strict';

  /**
   * ChargingLogResource service.
   * @module com.kodfarki.subscreasy.client/ChargingLogResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new ChargingLogResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/ChargingLogResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createChargingLogUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~createChargingLogUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ChargingLog} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createChargingLog
     * @param {module:com.kodfarki.subscreasy.client.model/ChargingLog} chargingLog chargingLog
     * @param {module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~createChargingLogUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ChargingLog}
     */
    this.createChargingLogUsingPOST = function(chargingLog, callback) {
      var postBody = chargingLog;

      // verify the required parameter 'chargingLog' is set
      if (chargingLog === undefined || chargingLog === null) {
        throw new Error("Missing the required parameter 'chargingLog' when calling createChargingLogUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = ChargingLog;

      return this.apiClient.callApi(
        '/api/charging-logs', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteChargingLogUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~deleteChargingLogUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteChargingLog
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~deleteChargingLogUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteChargingLogUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteChargingLogUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/charging-logs/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllChargingLogsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~getAllChargingLogsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/ChargingLog>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllChargingLogs
     * @param {Object} opts Optional parameters
     * @param {Number} opts.page Page number of the requested page
     * @param {Number} opts.size Size of a page
     * @param {Array.<String>} opts.sort Sorting criteria in the format: property(,asc|desc). Default sort order is ascending. Multiple sort criteria are supported.
     * @param {module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~getAllChargingLogsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/ChargingLog>}
     */
    this.getAllChargingLogsUsingGET = function(opts, callback) {
      opts = opts || {};
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
        'page': opts['page'],
        'size': opts['size'],
      };
      var collectionQueryParams = {
        'sort': {
          value: opts['sort'],
          collectionFormat: 'multi'
        },
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [ChargingLog];

      return this.apiClient.callApi(
        '/api/charging-logs', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getChargingLogUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~getChargingLogUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ChargingLog} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getChargingLog
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~getChargingLogUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ChargingLog}
     */
    this.getChargingLogUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getChargingLogUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = ChargingLog;

      return this.apiClient.callApi(
        '/api/charging-logs/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the refundUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~refundUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ChargingLog} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * refund
     * @param {Number} chargingLogId chargingLogId
     * @param {module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~refundUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ChargingLog}
     */
    this.refundUsingPOST = function(chargingLogId, callback) {
      var postBody = null;

      // verify the required parameter 'chargingLogId' is set
      if (chargingLogId === undefined || chargingLogId === null) {
        throw new Error("Missing the required parameter 'chargingLogId' when calling refundUsingPOST");
      }


      var pathParams = {
        'chargingLogId': chargingLogId
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = ChargingLog;

      return this.apiClient.callApi(
        '/api/charging-logs/refund/{chargingLogId}', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateChargingLogUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~updateChargingLogUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ChargingLog} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateChargingLog
     * @param {module:com.kodfarki.subscreasy.client.model/ChargingLog} chargingLog chargingLog
     * @param {module:com.kodfarki.subscreasy.client/ChargingLogResourceApi~updateChargingLogUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ChargingLog}
     */
    this.updateChargingLogUsingPUT = function(chargingLog, callback) {
      var postBody = chargingLog;

      // verify the required parameter 'chargingLog' is set
      if (chargingLog === undefined || chargingLog === null) {
        throw new Error("Missing the required parameter 'chargingLog' when calling updateChargingLogUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = ChargingLog;

      return this.apiClient.callApi(
        '/api/charging-logs', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/ChargingLog":15}],47:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/CompanyProps'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/CompanyProps'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.CompanyPropsResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.CompanyProps);
  }
}(this, function(ApiClient, CompanyProps) {
  'use strict';

  /**
   * CompanyPropsResource service.
   * @module com.kodfarki.subscreasy.client/CompanyPropsResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new CompanyPropsResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createCompanyPropsUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~createCompanyPropsUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/CompanyProps} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createCompanyProps
     * @param {module:com.kodfarki.subscreasy.client.model/CompanyProps} companyProps companyProps
     * @param {module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~createCompanyPropsUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/CompanyProps}
     */
    this.createCompanyPropsUsingPOST = function(companyProps, callback) {
      var postBody = companyProps;

      // verify the required parameter 'companyProps' is set
      if (companyProps === undefined || companyProps === null) {
        throw new Error("Missing the required parameter 'companyProps' when calling createCompanyPropsUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = CompanyProps;

      return this.apiClient.callApi(
        '/api/company-props', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteCompanyPropsUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~deleteCompanyPropsUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteCompanyProps
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~deleteCompanyPropsUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteCompanyPropsUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteCompanyPropsUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/company-props/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllCompanyPropsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~getAllCompanyPropsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/CompanyProps>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllCompanyProps
     * @param {module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~getAllCompanyPropsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/CompanyProps>}
     */
    this.getAllCompanyPropsUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [CompanyProps];

      return this.apiClient.callApi(
        '/api/company-props', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getCompanyPropsByCompanyIdUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~getCompanyPropsByCompanyIdUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/CompanyProps} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getCompanyPropsByCompanyId
     * @param {Number} companyId companyId
     * @param {module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~getCompanyPropsByCompanyIdUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/CompanyProps}
     */
    this.getCompanyPropsByCompanyIdUsingGET = function(companyId, callback) {
      var postBody = null;

      // verify the required parameter 'companyId' is set
      if (companyId === undefined || companyId === null) {
        throw new Error("Missing the required parameter 'companyId' when calling getCompanyPropsByCompanyIdUsingGET");
      }


      var pathParams = {
        'companyId': companyId
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = CompanyProps;

      return this.apiClient.callApi(
        '/api/company-props/company/{companyId}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateCompanyPropsUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~updateCompanyPropsUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/CompanyProps} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateCompanyProps
     * @param {module:com.kodfarki.subscreasy.client.model/CompanyProps} companyProps companyProps
     * @param {module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi~updateCompanyPropsUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/CompanyProps}
     */
    this.updateCompanyPropsUsingPUT = function(companyProps, callback) {
      var postBody = companyProps;

      // verify the required parameter 'companyProps' is set
      if (companyProps === undefined || companyProps === null) {
        throw new Error("Missing the required parameter 'companyProps' when calling updateCompanyPropsUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = CompanyProps;

      return this.apiClient.callApi(
        '/api/company-props', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/CompanyProps":17}],48:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Company'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/Company'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.CompanyResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Company);
  }
}(this, function(ApiClient, Company) {
  'use strict';

  /**
   * CompanyResource service.
   * @module com.kodfarki.subscreasy.client/CompanyResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new CompanyResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/CompanyResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createCompanyUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyResourceApi~createCompanyUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Company} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createCompany
     * @param {module:com.kodfarki.subscreasy.client.model/Company} company company
     * @param {module:com.kodfarki.subscreasy.client/CompanyResourceApi~createCompanyUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Company}
     */
    this.createCompanyUsingPOST = function(company, callback) {
      var postBody = company;

      // verify the required parameter 'company' is set
      if (company === undefined || company === null) {
        throw new Error("Missing the required parameter 'company' when calling createCompanyUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Company;

      return this.apiClient.callApi(
        '/api/companies', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteCompanyUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyResourceApi~deleteCompanyUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteCompany
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/CompanyResourceApi~deleteCompanyUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteCompanyUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteCompanyUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/companies/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllCompaniesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyResourceApi~getAllCompaniesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Company>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllCompanies
     * @param {module:com.kodfarki.subscreasy.client/CompanyResourceApi~getAllCompaniesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Company>}
     */
    this.getAllCompaniesUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Company];

      return this.apiClient.callApi(
        '/api/companies', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getCompanyUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyResourceApi~getCompanyUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Company} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getCompany
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/CompanyResourceApi~getCompanyUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Company}
     */
    this.getCompanyUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getCompanyUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Company;

      return this.apiClient.callApi(
        '/api/companies/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateCompanyUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/CompanyResourceApi~updateCompanyUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Company} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateCompany
     * @param {module:com.kodfarki.subscreasy.client.model/Company} company company
     * @param {module:com.kodfarki.subscreasy.client/CompanyResourceApi~updateCompanyUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Company}
     */
    this.updateCompanyUsingPUT = function(company, callback) {
      var postBody = company;

      // verify the required parameter 'company' is set
      if (company === undefined || company === null) {
        throw new Error("Missing the required parameter 'company' when calling updateCompanyUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Company;

      return this.apiClient.callApi(
        '/api/companies', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/Company":16}],49:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Coupon'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/Coupon'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.CouponResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Coupon);
  }
}(this, function(ApiClient, Coupon) {
  'use strict';

  /**
   * CouponResource service.
   * @module com.kodfarki.subscreasy.client/CouponResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new CouponResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/CouponResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createCouponUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/CouponResourceApi~createCouponUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Coupon} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createCoupon
     * @param {module:com.kodfarki.subscreasy.client.model/Coupon} coupon coupon
     * @param {module:com.kodfarki.subscreasy.client/CouponResourceApi~createCouponUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Coupon}
     */
    this.createCouponUsingPOST = function(coupon, callback) {
      var postBody = coupon;

      // verify the required parameter 'coupon' is set
      if (coupon === undefined || coupon === null) {
        throw new Error("Missing the required parameter 'coupon' when calling createCouponUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Coupon;

      return this.apiClient.callApi(
        '/api/coupons', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteCouponUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/CouponResourceApi~deleteCouponUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteCoupon
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/CouponResourceApi~deleteCouponUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteCouponUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteCouponUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/coupons/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllCouponsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/CouponResourceApi~getAllCouponsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Coupon>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllCoupons
     * @param {module:com.kodfarki.subscreasy.client/CouponResourceApi~getAllCouponsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Coupon>}
     */
    this.getAllCouponsUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Coupon];

      return this.apiClient.callApi(
        '/api/coupons', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getCouponUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/CouponResourceApi~getCouponUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Coupon} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getCoupon
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/CouponResourceApi~getCouponUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Coupon}
     */
    this.getCouponUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getCouponUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Coupon;

      return this.apiClient.callApi(
        '/api/coupons/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateCouponUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/CouponResourceApi~updateCouponUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Coupon} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateCoupon
     * @param {module:com.kodfarki.subscreasy.client.model/Coupon} coupon coupon
     * @param {module:com.kodfarki.subscreasy.client/CouponResourceApi~updateCouponUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Coupon}
     */
    this.updateCouponUsingPUT = function(coupon, callback) {
      var postBody = coupon;

      // verify the required parameter 'coupon' is set
      if (coupon === undefined || coupon === null) {
        throw new Error("Missing the required parameter 'coupon' when calling updateCouponUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Coupon;

      return this.apiClient.callApi(
        '/api/coupons', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/Coupon":18}],50:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Authorization', 'com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse', 'com.kodfarki.subscreasy.client.model/ChargingLog', 'com.kodfarki.subscreasy.client.model/Deduction', 'com.kodfarki.subscreasy.client.model/DeductionResult', 'com.kodfarki.subscreasy.client.model/InvoiceRequest', 'com.kodfarki.subscreasy.client.model/MessageTemplate', 'com.kodfarki.subscreasy.client.model/ServiceInstanceResult', 'com.kodfarki.subscreasy.client.model/ServiceOfferingResult'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/Authorization'), require('../com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse'), require('../com.kodfarki.subscreasy.client.model/ChargingLog'), require('../com.kodfarki.subscreasy.client.model/Deduction'), require('../com.kodfarki.subscreasy.client.model/DeductionResult'), require('../com.kodfarki.subscreasy.client.model/InvoiceRequest'), require('../com.kodfarki.subscreasy.client.model/MessageTemplate'), require('../com.kodfarki.subscreasy.client.model/ServiceInstanceResult'), require('../com.kodfarki.subscreasy.client.model/ServiceOfferingResult'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.EndpointsApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Authorization, root.ApiDocumentation.AuthorizedServicesResponse, root.ApiDocumentation.ChargingLog, root.ApiDocumentation.Deduction, root.ApiDocumentation.DeductionResult, root.ApiDocumentation.InvoiceRequest, root.ApiDocumentation.MessageTemplate, root.ApiDocumentation.ServiceInstanceResult, root.ApiDocumentation.ServiceOfferingResult);
  }
}(this, function(ApiClient, Authorization, AuthorizedServicesResponse, ChargingLog, Deduction, DeductionResult, InvoiceRequest, MessageTemplate, ServiceInstanceResult, ServiceOfferingResult) {
  'use strict';

  /**
   * Endpoints service.
   * @module com.kodfarki.subscreasy.client/EndpointsApi
   * @version 1.0
   */

  /**
   * Constructs a new EndpointsApi. 
   * @alias module:com.kodfarki.subscreasy.client/EndpointsApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the authorizeUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~authorizeUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {'Boolean'} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * authorize
     * @param {module:com.kodfarki.subscreasy.client.model/Authorization} authorization authorization
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~authorizeUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link 'Boolean'}
     */
    this.authorizeUsingPUT = function(authorization, callback) {
      var postBody = authorization;

      // verify the required parameter 'authorization' is set
      if (authorization === undefined || authorization === null) {
        throw new Error("Missing the required parameter 'authorization' when calling authorizeUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = 'Boolean';

      return this.apiClient.callApi(
        '/api/authorize', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deductUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~deductUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/DeductionResult} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deduct
     * @param {module:com.kodfarki.subscreasy.client.model/Deduction} deduction deduction
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~deductUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/DeductionResult}
     */
    this.deductUsingPUT = function(deduction, callback) {
      var postBody = deduction;

      // verify the required parameter 'deduction' is set
      if (deduction === undefined || deduction === null) {
        throw new Error("Missing the required parameter 'deduction' when calling deductUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['application/json'];
      var returnType = DeductionResult;

      return this.apiClient.callApi(
        '/api/deduct', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAuthorizedServicesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~getAuthorizedServicesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAuthorizedServices
     * @param {String} secureId secureId
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~getAuthorizedServicesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse}
     */
    this.getAuthorizedServicesUsingGET = function(secureId, callback) {
      var postBody = null;

      // verify the required parameter 'secureId' is set
      if (secureId === undefined || secureId === null) {
        throw new Error("Missing the required parameter 'secureId' when calling getAuthorizedServicesUsingGET");
      }


      var pathParams = {
        'secureId': secureId
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = AuthorizedServicesResponse;

      return this.apiClient.callApi(
        '/api/service/subscriber/{secureId}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getChargingLogBySubscriptionUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~getChargingLogBySubscriptionUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/ChargingLog>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getChargingLogBySubscription
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~getChargingLogBySubscriptionUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/ChargingLog>}
     */
    this.getChargingLogBySubscriptionUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getChargingLogBySubscriptionUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [ChargingLog];

      return this.apiClient.callApi(
        '/api/charging-logs/subscription/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getCustomerTotalAmountUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~getCustomerTotalAmountUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {'Number'} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getCustomerTotalAmount
     * @param {String} id id
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~getCustomerTotalAmountUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link 'Number'}
     */
    this.getCustomerTotalAmountUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getCustomerTotalAmountUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = 'Number';

      return this.apiClient.callApi(
        '/api/customer-totalAmountCharge/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getInvoiceDetailsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~getInvoiceDetailsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Object} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getInvoiceDetails
     * @param {module:com.kodfarki.subscreasy.client.model/InvoiceRequest} invoiceRequest invoiceRequest
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~getInvoiceDetailsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Object}
     */
    this.getInvoiceDetailsUsingGET = function(invoiceRequest, callback) {
      var postBody = invoiceRequest;

      // verify the required parameter 'invoiceRequest' is set
      if (invoiceRequest === undefined || invoiceRequest === null) {
        throw new Error("Missing the required parameter 'invoiceRequest' when calling getInvoiceDetailsUsingGET");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Object;

      return this.apiClient.callApi(
        '/api/getInvoiceDetails', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getMessageTemplateUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~getMessageTemplateUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/MessageTemplate} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getMessageTemplate
     * @param {String} lifecycleEventName lifecycleEventName
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~getMessageTemplateUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/MessageTemplate}
     */
    this.getMessageTemplateUsingGET = function(lifecycleEventName, callback) {
      var postBody = null;

      // verify the required parameter 'lifecycleEventName' is set
      if (lifecycleEventName === undefined || lifecycleEventName === null) {
        throw new Error("Missing the required parameter 'lifecycleEventName' when calling getMessageTemplateUsingGET");
      }


      var pathParams = {
        'lifecycleEventName': lifecycleEventName
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = MessageTemplate;

      return this.apiClient.callApi(
        '/api/message-templates/email/{lifecycleEventName}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getServiceInstancesBySubscriptionUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~getServiceInstancesBySubscriptionUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/ServiceInstanceResult>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getServiceInstancesBySubscription
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~getServiceInstancesBySubscriptionUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/ServiceInstanceResult>}
     */
    this.getServiceInstancesBySubscriptionUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getServiceInstancesBySubscriptionUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [ServiceInstanceResult];

      return this.apiClient.callApi(
        '/api/service-instances/subscription/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getServiceOfferingsBySubscriptionPlanUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~getServiceOfferingsBySubscriptionPlanUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/ServiceOfferingResult>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getServiceOfferingsBySubscriptionPlan
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~getServiceOfferingsBySubscriptionPlanUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/ServiceOfferingResult>}
     */
    this.getServiceOfferingsBySubscriptionPlanUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getServiceOfferingsBySubscriptionPlanUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [ServiceOfferingResult];

      return this.apiClient.callApi(
        '/api/service-offerings/offer/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getTotalRevenuePerMonthUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/EndpointsApi~getTotalRevenuePerMonthUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<Object>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getTotalRevenuePerMonth
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/EndpointsApi~getTotalRevenuePerMonthUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<Object>}
     */
    this.getTotalRevenuePerMonthUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getTotalRevenuePerMonthUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Object];

      return this.apiClient.callApi(
        '/api/charging-logs-totalamount-customer/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/Authorization":12,"../com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse":13,"../com.kodfarki.subscreasy.client.model/ChargingLog":15,"../com.kodfarki.subscreasy.client.model/Deduction":19,"../com.kodfarki.subscreasy.client.model/DeductionResult":20,"../com.kodfarki.subscreasy.client.model/InvoiceRequest":23,"../com.kodfarki.subscreasy.client.model/MessageTemplate":25,"../com.kodfarki.subscreasy.client.model/ServiceInstanceResult":34,"../com.kodfarki.subscreasy.client.model/ServiceOfferingResult":36}],51:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/History'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/History'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.HistoryResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.History);
  }
}(this, function(ApiClient, History) {
  'use strict';

  /**
   * HistoryResource service.
   * @module com.kodfarki.subscreasy.client/HistoryResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new HistoryResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/HistoryResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createHistoryUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/HistoryResourceApi~createHistoryUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/History} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createHistory
     * @param {module:com.kodfarki.subscreasy.client.model/History} history history
     * @param {module:com.kodfarki.subscreasy.client/HistoryResourceApi~createHistoryUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/History}
     */
    this.createHistoryUsingPOST = function(history, callback) {
      var postBody = history;

      // verify the required parameter 'history' is set
      if (history === undefined || history === null) {
        throw new Error("Missing the required parameter 'history' when calling createHistoryUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = History;

      return this.apiClient.callApi(
        '/api/histories', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteHistoryUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/HistoryResourceApi~deleteHistoryUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteHistory
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/HistoryResourceApi~deleteHistoryUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteHistoryUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteHistoryUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/histories/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllHistoriesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/HistoryResourceApi~getAllHistoriesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/History>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllHistories
     * @param {module:com.kodfarki.subscreasy.client/HistoryResourceApi~getAllHistoriesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/History>}
     */
    this.getAllHistoriesUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [History];

      return this.apiClient.callApi(
        '/api/histories', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getHistoryUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/HistoryResourceApi~getHistoryUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/History} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getHistory
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/HistoryResourceApi~getHistoryUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/History}
     */
    this.getHistoryUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getHistoryUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = History;

      return this.apiClient.callApi(
        '/api/histories/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateHistoryUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/HistoryResourceApi~updateHistoryUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/History} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateHistory
     * @param {module:com.kodfarki.subscreasy.client.model/History} history history
     * @param {module:com.kodfarki.subscreasy.client/HistoryResourceApi~updateHistoryUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/History}
     */
    this.updateHistoryUsingPUT = function(history, callback) {
      var postBody = history;

      // verify the required parameter 'history' is set
      if (history === undefined || history === null) {
        throw new Error("Missing the required parameter 'history' when calling updateHistoryUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = History;

      return this.apiClient.callApi(
        '/api/histories', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/History":21}],52:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Invoice'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/Invoice'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.InvoiceResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Invoice);
  }
}(this, function(ApiClient, Invoice) {
  'use strict';

  /**
   * InvoiceResource service.
   * @module com.kodfarki.subscreasy.client/InvoiceResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new InvoiceResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/InvoiceResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createInvoiceUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/InvoiceResourceApi~createInvoiceUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Invoice} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createInvoice
     * @param {module:com.kodfarki.subscreasy.client.model/Invoice} invoice invoice
     * @param {module:com.kodfarki.subscreasy.client/InvoiceResourceApi~createInvoiceUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Invoice}
     */
    this.createInvoiceUsingPOST = function(invoice, callback) {
      var postBody = invoice;

      // verify the required parameter 'invoice' is set
      if (invoice === undefined || invoice === null) {
        throw new Error("Missing the required parameter 'invoice' when calling createInvoiceUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Invoice;

      return this.apiClient.callApi(
        '/api/invoices', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteInvoiceUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/InvoiceResourceApi~deleteInvoiceUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteInvoice
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/InvoiceResourceApi~deleteInvoiceUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteInvoiceUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteInvoiceUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/invoices/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllInvoicesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/InvoiceResourceApi~getAllInvoicesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Invoice>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllInvoices
     * @param {module:com.kodfarki.subscreasy.client/InvoiceResourceApi~getAllInvoicesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Invoice>}
     */
    this.getAllInvoicesUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Invoice];

      return this.apiClient.callApi(
        '/api/invoices', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getInvoiceBySubscriberUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/InvoiceResourceApi~getInvoiceBySubscriberUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Invoice>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getInvoiceBySubscriber
     * @param {String} subscriberSecureId subscriberSecureId
     * @param {module:com.kodfarki.subscreasy.client/InvoiceResourceApi~getInvoiceBySubscriberUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Invoice>}
     */
    this.getInvoiceBySubscriberUsingGET = function(subscriberSecureId, callback) {
      var postBody = null;

      // verify the required parameter 'subscriberSecureId' is set
      if (subscriberSecureId === undefined || subscriberSecureId === null) {
        throw new Error("Missing the required parameter 'subscriberSecureId' when calling getInvoiceBySubscriberUsingGET");
      }


      var pathParams = {
        'subscriberSecureId': subscriberSecureId
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Invoice];

      return this.apiClient.callApi(
        '/api/invoices/subscriber/{subscriberSecureId}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getInvoiceUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/InvoiceResourceApi~getInvoiceUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Invoice} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getInvoice
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/InvoiceResourceApi~getInvoiceUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Invoice}
     */
    this.getInvoiceUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getInvoiceUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Invoice;

      return this.apiClient.callApi(
        '/api/invoices/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateInvoiceUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/InvoiceResourceApi~updateInvoiceUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Invoice} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateInvoice
     * @param {module:com.kodfarki.subscreasy.client.model/Invoice} invoice invoice
     * @param {module:com.kodfarki.subscreasy.client/InvoiceResourceApi~updateInvoiceUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Invoice}
     */
    this.updateInvoiceUsingPUT = function(invoice, callback) {
      var postBody = invoice;

      // verify the required parameter 'invoice' is set
      if (invoice === undefined || invoice === null) {
        throw new Error("Missing the required parameter 'invoice' when calling updateInvoiceUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Invoice;

      return this.apiClient.callApi(
        '/api/invoices', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/Invoice":22}],53:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/MessageTemplate'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/MessageTemplate'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.MessageTemplateResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.MessageTemplate);
  }
}(this, function(ApiClient, MessageTemplate) {
  'use strict';

  /**
   * MessageTemplateResource service.
   * @module com.kodfarki.subscreasy.client/MessageTemplateResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new MessageTemplateResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createMessageTemplateUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~createMessageTemplateUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/MessageTemplate} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createMessageTemplate
     * @param {module:com.kodfarki.subscreasy.client.model/MessageTemplate} messageTemplate messageTemplate
     * @param {module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~createMessageTemplateUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/MessageTemplate}
     */
    this.createMessageTemplateUsingPOST = function(messageTemplate, callback) {
      var postBody = messageTemplate;

      // verify the required parameter 'messageTemplate' is set
      if (messageTemplate === undefined || messageTemplate === null) {
        throw new Error("Missing the required parameter 'messageTemplate' when calling createMessageTemplateUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = MessageTemplate;

      return this.apiClient.callApi(
        '/api/message-templates', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteMessageTemplateUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~deleteMessageTemplateUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteMessageTemplate
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~deleteMessageTemplateUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteMessageTemplateUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteMessageTemplateUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/message-templates/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllMessageTemplatesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~getAllMessageTemplatesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/MessageTemplate>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllMessageTemplates
     * @param {module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~getAllMessageTemplatesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/MessageTemplate>}
     */
    this.getAllMessageTemplatesUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [MessageTemplate];

      return this.apiClient.callApi(
        '/api/message-templates', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getMessageTemplateUsingGET1 operation.
     * @callback module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~getMessageTemplateUsingGET1Callback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/MessageTemplate} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getMessageTemplate
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~getMessageTemplateUsingGET1Callback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/MessageTemplate}
     */
    this.getMessageTemplateUsingGET1 = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getMessageTemplateUsingGET1");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = MessageTemplate;

      return this.apiClient.callApi(
        '/api/message-templates/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateMessageTemplateUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~updateMessageTemplateUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/MessageTemplate} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateMessageTemplate
     * @param {module:com.kodfarki.subscreasy.client.model/MessageTemplate} messageTemplate messageTemplate
     * @param {module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi~updateMessageTemplateUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/MessageTemplate}
     */
    this.updateMessageTemplateUsingPUT = function(messageTemplate, callback) {
      var postBody = messageTemplate;

      // verify the required parameter 'messageTemplate' is set
      if (messageTemplate === undefined || messageTemplate === null) {
        throw new Error("Missing the required parameter 'messageTemplate' when calling updateMessageTemplateUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = MessageTemplate;

      return this.apiClient.callApi(
        '/api/message-templates', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/MessageTemplate":25}],54:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Offer'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/Offer'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.OfferResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Offer);
  }
}(this, function(ApiClient, Offer) {
  'use strict';

  /**
   * OfferResource service.
   * @module com.kodfarki.subscreasy.client/OfferResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new OfferResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/OfferResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createOfferUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/OfferResourceApi~createOfferUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Offer} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createOffer
     * @param {module:com.kodfarki.subscreasy.client.model/Offer} offer offer
     * @param {module:com.kodfarki.subscreasy.client/OfferResourceApi~createOfferUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Offer}
     */
    this.createOfferUsingPOST = function(offer, callback) {
      var postBody = offer;

      // verify the required parameter 'offer' is set
      if (offer === undefined || offer === null) {
        throw new Error("Missing the required parameter 'offer' when calling createOfferUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Offer;

      return this.apiClient.callApi(
        '/api/offers', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteOfferUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/OfferResourceApi~deleteOfferUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteOffer
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/OfferResourceApi~deleteOfferUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteOfferUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteOfferUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/offers/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllOffersUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/OfferResourceApi~getAllOffersUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Offer>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllOffers
     * @param {module:com.kodfarki.subscreasy.client/OfferResourceApi~getAllOffersUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Offer>}
     */
    this.getAllOffersUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Offer];

      return this.apiClient.callApi(
        '/api/offers', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getOfferUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/OfferResourceApi~getOfferUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Offer} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getOffer
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/OfferResourceApi~getOfferUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Offer}
     */
    this.getOfferUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getOfferUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Offer;

      return this.apiClient.callApi(
        '/api/offers/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateOfferUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/OfferResourceApi~updateOfferUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Offer} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateOffer
     * @param {module:com.kodfarki.subscreasy.client.model/Offer} offer offer
     * @param {module:com.kodfarki.subscreasy.client/OfferResourceApi~updateOfferUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Offer}
     */
    this.updateOfferUsingPUT = function(offer, callback) {
      var postBody = offer;

      // verify the required parameter 'offer' is set
      if (offer === undefined || offer === null) {
        throw new Error("Missing the required parameter 'offer' when calling updateOfferUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Offer;

      return this.apiClient.callApi(
        '/api/offers', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/Offer":26}],55:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/ProfileInfoVM'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/ProfileInfoVM'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ProfileInfoResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.ProfileInfoVM);
  }
}(this, function(ApiClient, ProfileInfoVM) {
  'use strict';

  /**
   * ProfileInfoResource service.
   * @module com.kodfarki.subscreasy.client/ProfileInfoResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new ProfileInfoResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/ProfileInfoResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the getActiveProfilesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ProfileInfoResourceApi~getActiveProfilesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ProfileInfoVM} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getActiveProfiles
     * @param {module:com.kodfarki.subscreasy.client/ProfileInfoResourceApi~getActiveProfilesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ProfileInfoVM}
     */
    this.getActiveProfilesUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = ProfileInfoVM;

      return this.apiClient.callApi(
        '/api/profile-info', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/ProfileInfoVM":28}],56:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/ServiceInstance'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/ServiceInstance'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ServiceInstanceResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.ServiceInstance);
  }
}(this, function(ApiClient, ServiceInstance) {
  'use strict';

  /**
   * ServiceInstanceResource service.
   * @module com.kodfarki.subscreasy.client/ServiceInstanceResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new ServiceInstanceResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createServiceInstanceUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~createServiceInstanceUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceInstance} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createServiceInstance
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceInstance} serviceInstance serviceInstance
     * @param {module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~createServiceInstanceUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ServiceInstance}
     */
    this.createServiceInstanceUsingPOST = function(serviceInstance, callback) {
      var postBody = serviceInstance;

      // verify the required parameter 'serviceInstance' is set
      if (serviceInstance === undefined || serviceInstance === null) {
        throw new Error("Missing the required parameter 'serviceInstance' when calling createServiceInstanceUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = ServiceInstance;

      return this.apiClient.callApi(
        '/api/service-instances', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteServiceInstanceUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~deleteServiceInstanceUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteServiceInstance
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~deleteServiceInstanceUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteServiceInstanceUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteServiceInstanceUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/service-instances/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllServiceInstancesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~getAllServiceInstancesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/ServiceInstance>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllServiceInstances
     * @param {module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~getAllServiceInstancesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/ServiceInstance>}
     */
    this.getAllServiceInstancesUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [ServiceInstance];

      return this.apiClient.callApi(
        '/api/service-instances', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getServiceInstanceUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~getServiceInstanceUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceInstance} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getServiceInstance
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~getServiceInstanceUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ServiceInstance}
     */
    this.getServiceInstanceUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getServiceInstanceUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = ServiceInstance;

      return this.apiClient.callApi(
        '/api/service-instances/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateServiceInstanceUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~updateServiceInstanceUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceInstance} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateServiceInstance
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceInstance} serviceInstance serviceInstance
     * @param {module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi~updateServiceInstanceUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ServiceInstance}
     */
    this.updateServiceInstanceUsingPUT = function(serviceInstance, callback) {
      var postBody = serviceInstance;

      // verify the required parameter 'serviceInstance' is set
      if (serviceInstance === undefined || serviceInstance === null) {
        throw new Error("Missing the required parameter 'serviceInstance' when calling updateServiceInstanceUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = ServiceInstance;

      return this.apiClient.callApi(
        '/api/service-instances', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/ServiceInstance":33}],57:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/ServiceOffering'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/ServiceOffering'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ServiceOfferingResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.ServiceOffering);
  }
}(this, function(ApiClient, ServiceOffering) {
  'use strict';

  /**
   * ServiceOfferingResource service.
   * @module com.kodfarki.subscreasy.client/ServiceOfferingResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new ServiceOfferingResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createServiceOfferingUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~createServiceOfferingUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceOffering} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createServiceOffering
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceOffering} serviceOffering serviceOffering
     * @param {module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~createServiceOfferingUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ServiceOffering}
     */
    this.createServiceOfferingUsingPOST = function(serviceOffering, callback) {
      var postBody = serviceOffering;

      // verify the required parameter 'serviceOffering' is set
      if (serviceOffering === undefined || serviceOffering === null) {
        throw new Error("Missing the required parameter 'serviceOffering' when calling createServiceOfferingUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = ServiceOffering;

      return this.apiClient.callApi(
        '/api/service-offerings', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteServiceOfferingUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~deleteServiceOfferingUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteServiceOffering
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~deleteServiceOfferingUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteServiceOfferingUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteServiceOfferingUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/service-offerings/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllServiceOfferingsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~getAllServiceOfferingsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/ServiceOffering>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllServiceOfferings
     * @param {module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~getAllServiceOfferingsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/ServiceOffering>}
     */
    this.getAllServiceOfferingsUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [ServiceOffering];

      return this.apiClient.callApi(
        '/api/service-offerings', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getServiceOfferingUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~getServiceOfferingUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceOffering} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getServiceOffering
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~getServiceOfferingUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ServiceOffering}
     */
    this.getServiceOfferingUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getServiceOfferingUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = ServiceOffering;

      return this.apiClient.callApi(
        '/api/service-offerings/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateServiceOfferingUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~updateServiceOfferingUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceOffering} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateServiceOffering
     * @param {module:com.kodfarki.subscreasy.client.model/ServiceOffering} serviceOffering serviceOffering
     * @param {module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi~updateServiceOfferingUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ServiceOffering}
     */
    this.updateServiceOfferingUsingPUT = function(serviceOffering, callback) {
      var postBody = serviceOffering;

      // verify the required parameter 'serviceOffering' is set
      if (serviceOffering === undefined || serviceOffering === null) {
        throw new Error("Missing the required parameter 'serviceOffering' when calling updateServiceOfferingUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = ServiceOffering;

      return this.apiClient.callApi(
        '/api/service-offerings', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/ServiceOffering":35}],58:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Service'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/Service'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.ServiceResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Service);
  }
}(this, function(ApiClient, Service) {
  'use strict';

  /**
   * ServiceResource service.
   * @module com.kodfarki.subscreasy.client/ServiceResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new ServiceResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/ServiceResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createServiceUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceResourceApi~createServiceUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Service} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createService
     * @param {module:com.kodfarki.subscreasy.client.model/Service} service service
     * @param {module:com.kodfarki.subscreasy.client/ServiceResourceApi~createServiceUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Service}
     */
    this.createServiceUsingPOST = function(service, callback) {
      var postBody = service;

      // verify the required parameter 'service' is set
      if (service === undefined || service === null) {
        throw new Error("Missing the required parameter 'service' when calling createServiceUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Service;

      return this.apiClient.callApi(
        '/api/services', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteServiceUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceResourceApi~deleteServiceUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteService
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/ServiceResourceApi~deleteServiceUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteServiceUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteServiceUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/services/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllServicesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceResourceApi~getAllServicesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Service>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllServices
     * @param {module:com.kodfarki.subscreasy.client/ServiceResourceApi~getAllServicesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Service>}
     */
    this.getAllServicesUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Service];

      return this.apiClient.callApi(
        '/api/services', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getServiceUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceResourceApi~getServiceUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Service} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getService
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/ServiceResourceApi~getServiceUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Service}
     */
    this.getServiceUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getServiceUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Service;

      return this.apiClient.callApi(
        '/api/services/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateServiceUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/ServiceResourceApi~updateServiceUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Service} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateService
     * @param {module:com.kodfarki.subscreasy.client.model/Service} service service
     * @param {module:com.kodfarki.subscreasy.client/ServiceResourceApi~updateServiceUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Service}
     */
    this.updateServiceUsingPUT = function(service, callback) {
      var postBody = service;

      // verify the required parameter 'service' is set
      if (service === undefined || service === null) {
        throw new Error("Missing the required parameter 'service' when calling updateServiceUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Service;

      return this.apiClient.callApi(
        '/api/services', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/Service":32}],59:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Subscriber'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/Subscriber'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.SubscriberResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Subscriber);
  }
}(this, function(ApiClient, Subscriber) {
  'use strict';

  /**
   * SubscriberResource service.
   * @module com.kodfarki.subscreasy.client/SubscriberResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new SubscriberResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/SubscriberResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createSubscriberUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/SubscriberResourceApi~createSubscriberUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Subscriber} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createSubscriber
     * @param {module:com.kodfarki.subscreasy.client.model/Subscriber} subscriber subscriber
     * @param {module:com.kodfarki.subscreasy.client/SubscriberResourceApi~createSubscriberUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Subscriber}
     */
    this.createSubscriberUsingPOST = function(subscriber, callback) {
      var postBody = subscriber;

      // verify the required parameter 'subscriber' is set
      if (subscriber === undefined || subscriber === null) {
        throw new Error("Missing the required parameter 'subscriber' when calling createSubscriberUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Subscriber;

      return this.apiClient.callApi(
        '/api/subscribers', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteSubscriberUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/SubscriberResourceApi~deleteSubscriberUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteSubscriber
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/SubscriberResourceApi~deleteSubscriberUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteSubscriberUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteSubscriberUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/subscribers/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllSubscribersUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/SubscriberResourceApi~getAllSubscribersUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Subscriber>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllSubscribers
     * @param {module:com.kodfarki.subscreasy.client/SubscriberResourceApi~getAllSubscribersUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Subscriber>}
     */
    this.getAllSubscribersUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Subscriber];

      return this.apiClient.callApi(
        '/api/subscribers', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getSubscriberByEmailUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/SubscriberResourceApi~getSubscriberByEmailUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Subscriber>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getSubscriberByEmail
     * @param {String} email email
     * @param {module:com.kodfarki.subscreasy.client/SubscriberResourceApi~getSubscriberByEmailUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Subscriber>}
     */
    this.getSubscriberByEmailUsingGET = function(email, callback) {
      var postBody = null;

      // verify the required parameter 'email' is set
      if (email === undefined || email === null) {
        throw new Error("Missing the required parameter 'email' when calling getSubscriberByEmailUsingGET");
      }


      var pathParams = {
        'email': email
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Subscriber];

      return this.apiClient.callApi(
        '/api/subscribers/email/{email}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getSubscriberByNameUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/SubscriberResourceApi~getSubscriberByNameUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Subscriber>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getSubscriberByName
     * @param {String} name name
     * @param {module:com.kodfarki.subscreasy.client/SubscriberResourceApi~getSubscriberByNameUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Subscriber>}
     */
    this.getSubscriberByNameUsingGET = function(name, callback) {
      var postBody = null;

      // verify the required parameter 'name' is set
      if (name === undefined || name === null) {
        throw new Error("Missing the required parameter 'name' when calling getSubscriberByNameUsingGET");
      }


      var pathParams = {
        'name': name
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Subscriber];

      return this.apiClient.callApi(
        '/api/subscribers/name/{name}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getSubscriberUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/SubscriberResourceApi~getSubscriberUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Subscriber} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getSubscriber
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/SubscriberResourceApi~getSubscriberUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Subscriber}
     */
    this.getSubscriberUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getSubscriberUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Subscriber;

      return this.apiClient.callApi(
        '/api/subscribers/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateSubscriberUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/SubscriberResourceApi~updateSubscriberUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Subscriber} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateSubscriber
     * @param {module:com.kodfarki.subscreasy.client.model/Subscriber} subscriber subscriber
     * @param {module:com.kodfarki.subscreasy.client/SubscriberResourceApi~updateSubscriberUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Subscriber}
     */
    this.updateSubscriberUsingPUT = function(subscriber, callback) {
      var postBody = subscriber;

      // verify the required parameter 'subscriber' is set
      if (subscriber === undefined || subscriber === null) {
        throw new Error("Missing the required parameter 'subscriber' when calling updateSubscriberUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Subscriber;

      return this.apiClient.callApi(
        '/api/subscribers', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/Subscriber":38}],60:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Cancellation', 'com.kodfarki.subscreasy.client.model/StartSubscriptionRequest', 'com.kodfarki.subscreasy.client.model/SubscriptionCreateResult', 'com.kodfarki.subscreasy.client.model/Subsription'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/Cancellation'), require('../com.kodfarki.subscreasy.client.model/StartSubscriptionRequest'), require('../com.kodfarki.subscreasy.client.model/SubscriptionCreateResult'), require('../com.kodfarki.subscreasy.client.model/Subsription'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.SubsriptionResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.Cancellation, root.ApiDocumentation.StartSubscriptionRequest, root.ApiDocumentation.SubscriptionCreateResult, root.ApiDocumentation.Subsription);
  }
}(this, function(ApiClient, Cancellation, StartSubscriptionRequest, SubscriptionCreateResult, Subsription) {
  'use strict';

  /**
   * SubsriptionResource service.
   * @module com.kodfarki.subscreasy.client/SubsriptionResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new SubsriptionResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/SubsriptionResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the cancelSubscriptionUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~cancelSubscriptionUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Subsription} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * cancelSubscription
     * @param {module:com.kodfarki.subscreasy.client.model/Cancellation} cancellation cancellation
     * @param {module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~cancelSubscriptionUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Subsription}
     */
    this.cancelSubscriptionUsingPUT = function(cancellation, callback) {
      var postBody = cancellation;

      // verify the required parameter 'cancellation' is set
      if (cancellation === undefined || cancellation === null) {
        throw new Error("Missing the required parameter 'cancellation' when calling cancelSubscriptionUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = Subsription;

      return this.apiClient.callApi(
        '/api/subscriptions/cancel', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getActiveSubscriptionsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~getActiveSubscriptionsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Subsription>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getActiveSubscriptions
     * @param {String} secureId secureId
     * @param {module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~getActiveSubscriptionsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Subsription>}
     */
    this.getActiveSubscriptionsUsingGET = function(secureId, callback) {
      var postBody = null;

      // verify the required parameter 'secureId' is set
      if (secureId === undefined || secureId === null) {
        throw new Error("Missing the required parameter 'secureId' when calling getActiveSubscriptionsUsingGET");
      }


      var pathParams = {
        'secureId': secureId
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Subsription];

      return this.apiClient.callApi(
        '/api/subsriptions/subscriber/{secureId}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllCompanySubscriptionsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~getAllCompanySubscriptionsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/Subsription>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllCompanySubscriptions
     * @param {String} id id
     * @param {module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~getAllCompanySubscriptionsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/Subsription>}
     */
    this.getAllCompanySubscriptionsUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getAllCompanySubscriptionsUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [Subsription];

      return this.apiClient.callApi(
        '/api/subscriptions/company/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getSubsriptionUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~getSubsriptionUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/Subsription} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getSubsription
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~getSubsriptionUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/Subsription}
     */
    this.getSubsriptionUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getSubsriptionUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = Subsription;

      return this.apiClient.callApi(
        '/api/subsriptions/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the startSubscriptionUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~startSubscriptionUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/SubscriptionCreateResult} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * startSubscription
     * @param {module:com.kodfarki.subscreasy.client.model/StartSubscriptionRequest} request request
     * @param {module:com.kodfarki.subscreasy.client/SubsriptionResourceApi~startSubscriptionUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/SubscriptionCreateResult}
     */
    this.startSubscriptionUsingPOST = function(request, callback) {
      var postBody = request;

      // verify the required parameter 'request' is set
      if (request === undefined || request === null) {
        throw new Error("Missing the required parameter 'request' when calling startSubscriptionUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['application/json'];
      var returnType = SubscriptionCreateResult;

      return this.apiClient.callApi(
        '/api/subscriptions/start', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/Cancellation":14,"../com.kodfarki.subscreasy.client.model/StartSubscriptionRequest":37,"../com.kodfarki.subscreasy.client.model/SubscriptionCreateResult":39,"../com.kodfarki.subscreasy.client.model/Subsription":41}],61:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/UsageNotification'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/UsageNotification'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.UsageNotificationResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.UsageNotification);
  }
}(this, function(ApiClient, UsageNotification) {
  'use strict';

  /**
   * UsageNotificationResource service.
   * @module com.kodfarki.subscreasy.client/UsageNotificationResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new UsageNotificationResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createUsageNotificationUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~createUsageNotificationUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/UsageNotification} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createUsageNotification
     * @param {module:com.kodfarki.subscreasy.client.model/UsageNotification} usageNotification usageNotification
     * @param {module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~createUsageNotificationUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/UsageNotification}
     */
    this.createUsageNotificationUsingPOST = function(usageNotification, callback) {
      var postBody = usageNotification;

      // verify the required parameter 'usageNotification' is set
      if (usageNotification === undefined || usageNotification === null) {
        throw new Error("Missing the required parameter 'usageNotification' when calling createUsageNotificationUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = UsageNotification;

      return this.apiClient.callApi(
        '/api/usage-notifications', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteUsageNotificationUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~deleteUsageNotificationUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteUsageNotification
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~deleteUsageNotificationUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteUsageNotificationUsingDELETE = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling deleteUsageNotificationUsingDELETE");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/usage-notifications/{id}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllUsageNotificationsUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~getAllUsageNotificationsUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/UsageNotification>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllUsageNotifications
     * @param {module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~getAllUsageNotificationsUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/UsageNotification>}
     */
    this.getAllUsageNotificationsUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [UsageNotification];

      return this.apiClient.callApi(
        '/api/usage-notifications', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getUsageNotificationUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~getUsageNotificationUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/UsageNotification} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getUsageNotification
     * @param {Number} id id
     * @param {module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~getUsageNotificationUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/UsageNotification}
     */
    this.getUsageNotificationUsingGET = function(id, callback) {
      var postBody = null;

      // verify the required parameter 'id' is set
      if (id === undefined || id === null) {
        throw new Error("Missing the required parameter 'id' when calling getUsageNotificationUsingGET");
      }


      var pathParams = {
        'id': id
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = UsageNotification;

      return this.apiClient.callApi(
        '/api/usage-notifications/{id}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateUsageNotificationUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~updateUsageNotificationUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/UsageNotification} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateUsageNotification
     * @param {module:com.kodfarki.subscreasy.client.model/UsageNotification} usageNotification usageNotification
     * @param {module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi~updateUsageNotificationUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/UsageNotification}
     */
    this.updateUsageNotificationUsingPUT = function(usageNotification, callback) {
      var postBody = usageNotification;

      // verify the required parameter 'usageNotification' is set
      if (usageNotification === undefined || usageNotification === null) {
        throw new Error("Missing the required parameter 'usageNotification' when calling updateUsageNotificationUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = UsageNotification;

      return this.apiClient.callApi(
        '/api/usage-notifications', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/UsageNotification":42}],62:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/ManagedUserVM', 'com.kodfarki.subscreasy.client.model/ResponseEntity', 'com.kodfarki.subscreasy.client.model/User'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('../com.kodfarki.subscreasy.client.model/ManagedUserVM'), require('../com.kodfarki.subscreasy.client.model/ResponseEntity'), require('../com.kodfarki.subscreasy.client.model/User'));
  } else {
    // Browser globals (root is window)
    if (!root.ApiDocumentation) {
      root.ApiDocumentation = {};
    }
    root.ApiDocumentation.UserResourceApi = factory(root.ApiDocumentation.ApiClient, root.ApiDocumentation.ManagedUserVM, root.ApiDocumentation.ResponseEntity, root.ApiDocumentation.User);
  }
}(this, function(ApiClient, ManagedUserVM, ResponseEntity, User) {
  'use strict';

  /**
   * UserResource service.
   * @module com.kodfarki.subscreasy.client/UserResourceApi
   * @version 1.0
   */

  /**
   * Constructs a new UserResourceApi. 
   * @alias module:com.kodfarki.subscreasy.client/UserResourceApi
   * @class
   * @param {module:ApiClient} [apiClient] Optional API client implementation to use,
   * default to {@link module:ApiClient#instance} if unspecified.
   */
  var exports = function(apiClient) {
    this.apiClient = apiClient || ApiClient.instance;


    /**
     * Callback function to receive the result of the createUserUsingPOST operation.
     * @callback module:com.kodfarki.subscreasy.client/UserResourceApi~createUserUsingPOSTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/ResponseEntity} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * createUser
     * @param {module:com.kodfarki.subscreasy.client.model/ManagedUserVM} managedUserVM managedUserVM
     * @param {module:com.kodfarki.subscreasy.client/UserResourceApi~createUserUsingPOSTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/ResponseEntity}
     */
    this.createUserUsingPOST = function(managedUserVM, callback) {
      var postBody = managedUserVM;

      // verify the required parameter 'managedUserVM' is set
      if (managedUserVM === undefined || managedUserVM === null) {
        throw new Error("Missing the required parameter 'managedUserVM' when calling createUserUsingPOST");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = ResponseEntity;

      return this.apiClient.callApi(
        '/api/users', 'POST',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the deleteUserUsingDELETE operation.
     * @callback module:com.kodfarki.subscreasy.client/UserResourceApi~deleteUserUsingDELETECallback
     * @param {String} error Error message, if any.
     * @param data This operation does not return a value.
     * @param {String} response The complete HTTP response.
     */

    /**
     * deleteUser
     * @param {String} login login
     * @param {module:com.kodfarki.subscreasy.client/UserResourceApi~deleteUserUsingDELETECallback} callback The callback function, accepting three arguments: error, data, response
     */
    this.deleteUserUsingDELETE = function(login, callback) {
      var postBody = null;

      // verify the required parameter 'login' is set
      if (login === undefined || login === null) {
        throw new Error("Missing the required parameter 'login' when calling deleteUserUsingDELETE");
      }


      var pathParams = {
        'login': login
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = null;

      return this.apiClient.callApi(
        '/api/users/{login}', 'DELETE',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAllUsersUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/UserResourceApi~getAllUsersUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<module:com.kodfarki.subscreasy.client.model/User>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAllUsers
     * @param {Object} opts Optional parameters
     * @param {Number} opts.page Page number of the requested page
     * @param {Number} opts.size Size of a page
     * @param {Array.<String>} opts.sort Sorting criteria in the format: property(,asc|desc). Default sort order is ascending. Multiple sort criteria are supported.
     * @param {module:com.kodfarki.subscreasy.client/UserResourceApi~getAllUsersUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<module:com.kodfarki.subscreasy.client.model/User>}
     */
    this.getAllUsersUsingGET = function(opts, callback) {
      opts = opts || {};
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
        'page': opts['page'],
        'size': opts['size'],
      };
      var collectionQueryParams = {
        'sort': {
          value: opts['sort'],
          collectionFormat: 'multi'
        },
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = [User];

      return this.apiClient.callApi(
        '/api/users', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getAuthoritiesUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/UserResourceApi~getAuthoritiesUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {Array.<'String'>} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getAuthorities
     * @param {module:com.kodfarki.subscreasy.client/UserResourceApi~getAuthoritiesUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link Array.<'String'>}
     */
    this.getAuthoritiesUsingGET = function(callback) {
      var postBody = null;


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = ['String'];

      return this.apiClient.callApi(
        '/api/users/authorities', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the getUserUsingGET operation.
     * @callback module:com.kodfarki.subscreasy.client/UserResourceApi~getUserUsingGETCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/User} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * getUser
     * @param {String} login login
     * @param {module:com.kodfarki.subscreasy.client/UserResourceApi~getUserUsingGETCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/User}
     */
    this.getUserUsingGET = function(login, callback) {
      var postBody = null;

      // verify the required parameter 'login' is set
      if (login === undefined || login === null) {
        throw new Error("Missing the required parameter 'login' when calling getUserUsingGET");
      }


      var pathParams = {
        'login': login
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = [];
      var accepts = ['*/*'];
      var returnType = User;

      return this.apiClient.callApi(
        '/api/users/{login}', 'GET',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }

    /**
     * Callback function to receive the result of the updateUserUsingPUT operation.
     * @callback module:com.kodfarki.subscreasy.client/UserResourceApi~updateUserUsingPUTCallback
     * @param {String} error Error message, if any.
     * @param {module:com.kodfarki.subscreasy.client.model/User} data The data returned by the service call.
     * @param {String} response The complete HTTP response.
     */

    /**
     * updateUser
     * @param {module:com.kodfarki.subscreasy.client.model/ManagedUserVM} managedUserVM managedUserVM
     * @param {module:com.kodfarki.subscreasy.client/UserResourceApi~updateUserUsingPUTCallback} callback The callback function, accepting three arguments: error, data, response
     * data is of type: {@link module:com.kodfarki.subscreasy.client.model/User}
     */
    this.updateUserUsingPUT = function(managedUserVM, callback) {
      var postBody = managedUserVM;

      // verify the required parameter 'managedUserVM' is set
      if (managedUserVM === undefined || managedUserVM === null) {
        throw new Error("Missing the required parameter 'managedUserVM' when calling updateUserUsingPUT");
      }


      var pathParams = {
      };
      var queryParams = {
      };
      var collectionQueryParams = {
      };
      var headerParams = {
      };
      var formParams = {
      };

      var authNames = ['apiKey'];
      var contentTypes = ['application/json'];
      var accepts = ['*/*'];
      var returnType = User;

      return this.apiClient.callApi(
        '/api/users', 'PUT',
        pathParams, queryParams, collectionQueryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
      );
    }
  };

  return exports;
}));

},{"../ApiClient":9,"../com.kodfarki.subscreasy.client.model/ManagedUserVM":24,"../com.kodfarki.subscreasy.client.model/ResponseEntity":30,"../com.kodfarki.subscreasy.client.model/User":43}],63:[function(require,module,exports){
/**
 * Api Documentation
 * Api Documentation
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.1
 *
 * Do not edit the class manually.
 *
 */

(function(factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient', 'com.kodfarki.subscreasy.client.model/Address', 'com.kodfarki.subscreasy.client.model/Authority', 'com.kodfarki.subscreasy.client.model/Authorization', 'com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse', 'com.kodfarki.subscreasy.client.model/Cancellation', 'com.kodfarki.subscreasy.client.model/ChargingLog', 'com.kodfarki.subscreasy.client.model/Company', 'com.kodfarki.subscreasy.client.model/CompanyProps', 'com.kodfarki.subscreasy.client.model/Coupon', 'com.kodfarki.subscreasy.client.model/Deduction', 'com.kodfarki.subscreasy.client.model/DeductionResult', 'com.kodfarki.subscreasy.client.model/History', 'com.kodfarki.subscreasy.client.model/Invoice', 'com.kodfarki.subscreasy.client.model/InvoiceRequest', 'com.kodfarki.subscreasy.client.model/ManagedUserVM', 'com.kodfarki.subscreasy.client.model/MessageTemplate', 'com.kodfarki.subscreasy.client.model/Offer', 'com.kodfarki.subscreasy.client.model/PaymentCard', 'com.kodfarki.subscreasy.client.model/ProfileInfoVM', 'com.kodfarki.subscreasy.client.model/RecurrencePeriod', 'com.kodfarki.subscreasy.client.model/ResponseEntity', 'com.kodfarki.subscreasy.client.model/SavedCard', 'com.kodfarki.subscreasy.client.model/Service', 'com.kodfarki.subscreasy.client.model/ServiceInstance', 'com.kodfarki.subscreasy.client.model/ServiceInstanceResult', 'com.kodfarki.subscreasy.client.model/ServiceOffering', 'com.kodfarki.subscreasy.client.model/ServiceOfferingResult', 'com.kodfarki.subscreasy.client.model/StartSubscriptionRequest', 'com.kodfarki.subscreasy.client.model/Subscriber', 'com.kodfarki.subscreasy.client.model/SubscriptionCreateResult', 'com.kodfarki.subscreasy.client.model/SubscriptionPlan', 'com.kodfarki.subscreasy.client.model/Subsription', 'com.kodfarki.subscreasy.client.model/UsageNotification', 'com.kodfarki.subscreasy.client.model/User', 'com.kodfarki.subscreasy.client/AnalyticsResourceApi', 'com.kodfarki.subscreasy.client/CardResourceApi', 'com.kodfarki.subscreasy.client/ChargingLogResourceApi', 'com.kodfarki.subscreasy.client/CompanyPropsResourceApi', 'com.kodfarki.subscreasy.client/CompanyResourceApi', 'com.kodfarki.subscreasy.client/CouponResourceApi', 'com.kodfarki.subscreasy.client/EndpointsApi', 'com.kodfarki.subscreasy.client/HistoryResourceApi', 'com.kodfarki.subscreasy.client/InvoiceResourceApi', 'com.kodfarki.subscreasy.client/MessageTemplateResourceApi', 'com.kodfarki.subscreasy.client/OfferResourceApi', 'com.kodfarki.subscreasy.client/ProfileInfoResourceApi', 'com.kodfarki.subscreasy.client/ServiceInstanceResourceApi', 'com.kodfarki.subscreasy.client/ServiceOfferingResourceApi', 'com.kodfarki.subscreasy.client/ServiceResourceApi', 'com.kodfarki.subscreasy.client/SubscriberResourceApi', 'com.kodfarki.subscreasy.client/SubsriptionResourceApi', 'com.kodfarki.subscreasy.client/UsageNotificationResourceApi', 'com.kodfarki.subscreasy.client/UserResourceApi'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('./ApiClient'), require('./com.kodfarki.subscreasy.client.model/Address'), require('./com.kodfarki.subscreasy.client.model/Authority'), require('./com.kodfarki.subscreasy.client.model/Authorization'), require('./com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse'), require('./com.kodfarki.subscreasy.client.model/Cancellation'), require('./com.kodfarki.subscreasy.client.model/ChargingLog'), require('./com.kodfarki.subscreasy.client.model/Company'), require('./com.kodfarki.subscreasy.client.model/CompanyProps'), require('./com.kodfarki.subscreasy.client.model/Coupon'), require('./com.kodfarki.subscreasy.client.model/Deduction'), require('./com.kodfarki.subscreasy.client.model/DeductionResult'), require('./com.kodfarki.subscreasy.client.model/History'), require('./com.kodfarki.subscreasy.client.model/Invoice'), require('./com.kodfarki.subscreasy.client.model/InvoiceRequest'), require('./com.kodfarki.subscreasy.client.model/ManagedUserVM'), require('./com.kodfarki.subscreasy.client.model/MessageTemplate'), require('./com.kodfarki.subscreasy.client.model/Offer'), require('./com.kodfarki.subscreasy.client.model/PaymentCard'), require('./com.kodfarki.subscreasy.client.model/ProfileInfoVM'), require('./com.kodfarki.subscreasy.client.model/RecurrencePeriod'), require('./com.kodfarki.subscreasy.client.model/ResponseEntity'), require('./com.kodfarki.subscreasy.client.model/SavedCard'), require('./com.kodfarki.subscreasy.client.model/Service'), require('./com.kodfarki.subscreasy.client.model/ServiceInstance'), require('./com.kodfarki.subscreasy.client.model/ServiceInstanceResult'), require('./com.kodfarki.subscreasy.client.model/ServiceOffering'), require('./com.kodfarki.subscreasy.client.model/ServiceOfferingResult'), require('./com.kodfarki.subscreasy.client.model/StartSubscriptionRequest'), require('./com.kodfarki.subscreasy.client.model/Subscriber'), require('./com.kodfarki.subscreasy.client.model/SubscriptionCreateResult'), require('./com.kodfarki.subscreasy.client.model/SubscriptionPlan'), require('./com.kodfarki.subscreasy.client.model/Subsription'), require('./com.kodfarki.subscreasy.client.model/UsageNotification'), require('./com.kodfarki.subscreasy.client.model/User'), require('./com.kodfarki.subscreasy.client/AnalyticsResourceApi'), require('./com.kodfarki.subscreasy.client/CardResourceApi'), require('./com.kodfarki.subscreasy.client/ChargingLogResourceApi'), require('./com.kodfarki.subscreasy.client/CompanyPropsResourceApi'), require('./com.kodfarki.subscreasy.client/CompanyResourceApi'), require('./com.kodfarki.subscreasy.client/CouponResourceApi'), require('./com.kodfarki.subscreasy.client/EndpointsApi'), require('./com.kodfarki.subscreasy.client/HistoryResourceApi'), require('./com.kodfarki.subscreasy.client/InvoiceResourceApi'), require('./com.kodfarki.subscreasy.client/MessageTemplateResourceApi'), require('./com.kodfarki.subscreasy.client/OfferResourceApi'), require('./com.kodfarki.subscreasy.client/ProfileInfoResourceApi'), require('./com.kodfarki.subscreasy.client/ServiceInstanceResourceApi'), require('./com.kodfarki.subscreasy.client/ServiceOfferingResourceApi'), require('./com.kodfarki.subscreasy.client/ServiceResourceApi'), require('./com.kodfarki.subscreasy.client/SubscriberResourceApi'), require('./com.kodfarki.subscreasy.client/SubsriptionResourceApi'), require('./com.kodfarki.subscreasy.client/UsageNotificationResourceApi'), require('./com.kodfarki.subscreasy.client/UserResourceApi'));
  }
}(function(ApiClient, Address, Authority, Authorization, AuthorizedServicesResponse, Cancellation, ChargingLog, Company, CompanyProps, Coupon, Deduction, DeductionResult, History, Invoice, InvoiceRequest, ManagedUserVM, MessageTemplate, Offer, PaymentCard, ProfileInfoVM, RecurrencePeriod, ResponseEntity, SavedCard, Service, ServiceInstance, ServiceInstanceResult, ServiceOffering, ServiceOfferingResult, StartSubscriptionRequest, Subscriber, SubscriptionCreateResult, SubscriptionPlan, Subsription, UsageNotification, User, AnalyticsResourceApi, CardResourceApi, ChargingLogResourceApi, CompanyPropsResourceApi, CompanyResourceApi, CouponResourceApi, EndpointsApi, HistoryResourceApi, InvoiceResourceApi, MessageTemplateResourceApi, OfferResourceApi, ProfileInfoResourceApi, ServiceInstanceResourceApi, ServiceOfferingResourceApi, ServiceResourceApi, SubscriberResourceApi, SubsriptionResourceApi, UsageNotificationResourceApi, UserResourceApi) {
  'use strict';

  /**
   * Api_Documentation.<br>
   * The <code>index</code> module provides access to constructors for all the classes which comprise the public API.
   * <p>
   * An AMD (recommended!) or CommonJS application will generally do something equivalent to the following:
   * <pre>
   * var ApiDocumentation = require('index'); // See note below*.
   * var xxxSvc = new ApiDocumentation.XxxApi(); // Allocate the API class we're going to use.
   * var yyyModel = new ApiDocumentation.Yyy(); // Construct a model instance.
   * yyyModel.someProperty = 'someValue';
   * ...
   * var zzz = xxxSvc.doSomething(yyyModel); // Invoke the service.
   * ...
   * </pre>
   * <em>*NOTE: For a top-level AMD script, use require(['index'], function(){...})
   * and put the application logic within the callback function.</em>
   * </p>
   * <p>
   * A non-AMD browser application (discouraged) might do something like this:
   * <pre>
   * var xxxSvc = new ApiDocumentation.XxxApi(); // Allocate the API class we're going to use.
   * var yyy = new ApiDocumentation.Yyy(); // Construct a model instance.
   * yyyModel.someProperty = 'someValue';
   * ...
   * var zzz = xxxSvc.doSomething(yyyModel); // Invoke the service.
   * ...
   * </pre>
   * </p>
   * @module index
   * @version 1.0
   */
  var exports = {
    /**
     * The ApiClient constructor.
     * @property {module:ApiClient}
     */
    ApiClient: ApiClient,
    /**
     * The Address model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Address}
     */
    Address: Address,
    /**
     * The Authority model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Authority}
     */
    Authority: Authority,
    /**
     * The Authorization model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Authorization}
     */
    Authorization: Authorization,
    /**
     * The AuthorizedServicesResponse model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse}
     */
    AuthorizedServicesResponse: AuthorizedServicesResponse,
    /**
     * The Cancellation model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Cancellation}
     */
    Cancellation: Cancellation,
    /**
     * The ChargingLog model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/ChargingLog}
     */
    ChargingLog: ChargingLog,
    /**
     * The Company model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Company}
     */
    Company: Company,
    /**
     * The CompanyProps model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/CompanyProps}
     */
    CompanyProps: CompanyProps,
    /**
     * The Coupon model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Coupon}
     */
    Coupon: Coupon,
    /**
     * The Deduction model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Deduction}
     */
    Deduction: Deduction,
    /**
     * The DeductionResult model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/DeductionResult}
     */
    DeductionResult: DeductionResult,
    /**
     * The History model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/History}
     */
    History: History,
    /**
     * The Invoice model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Invoice}
     */
    Invoice: Invoice,
    /**
     * The InvoiceRequest model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/InvoiceRequest}
     */
    InvoiceRequest: InvoiceRequest,
    /**
     * The ManagedUserVM model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/ManagedUserVM}
     */
    ManagedUserVM: ManagedUserVM,
    /**
     * The MessageTemplate model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/MessageTemplate}
     */
    MessageTemplate: MessageTemplate,
    /**
     * The Offer model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Offer}
     */
    Offer: Offer,
    /**
     * The PaymentCard model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/PaymentCard}
     */
    PaymentCard: PaymentCard,
    /**
     * The ProfileInfoVM model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/ProfileInfoVM}
     */
    ProfileInfoVM: ProfileInfoVM,
    /**
     * The RecurrencePeriod model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/RecurrencePeriod}
     */
    RecurrencePeriod: RecurrencePeriod,
    /**
     * The ResponseEntity model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/ResponseEntity}
     */
    ResponseEntity: ResponseEntity,
    /**
     * The SavedCard model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/SavedCard}
     */
    SavedCard: SavedCard,
    /**
     * The Service model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Service}
     */
    Service: Service,
    /**
     * The ServiceInstance model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/ServiceInstance}
     */
    ServiceInstance: ServiceInstance,
    /**
     * The ServiceInstanceResult model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/ServiceInstanceResult}
     */
    ServiceInstanceResult: ServiceInstanceResult,
    /**
     * The ServiceOffering model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/ServiceOffering}
     */
    ServiceOffering: ServiceOffering,
    /**
     * The ServiceOfferingResult model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/ServiceOfferingResult}
     */
    ServiceOfferingResult: ServiceOfferingResult,
    /**
     * The StartSubscriptionRequest model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/StartSubscriptionRequest}
     */
    StartSubscriptionRequest: StartSubscriptionRequest,
    /**
     * The Subscriber model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Subscriber}
     */
    Subscriber: Subscriber,
    /**
     * The SubscriptionCreateResult model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/SubscriptionCreateResult}
     */
    SubscriptionCreateResult: SubscriptionCreateResult,
    /**
     * The SubscriptionPlan model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/SubscriptionPlan}
     */
    SubscriptionPlan: SubscriptionPlan,
    /**
     * The Subsription model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/Subsription}
     */
    Subsription: Subsription,
    /**
     * The UsageNotification model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/UsageNotification}
     */
    UsageNotification: UsageNotification,
    /**
     * The User model constructor.
     * @property {module:com.kodfarki.subscreasy.client.model/User}
     */
    User: User,
    /**
     * The AnalyticsResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/AnalyticsResourceApi}
     */
    AnalyticsResourceApi: AnalyticsResourceApi,
    /**
     * The CardResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/CardResourceApi}
     */
    CardResourceApi: CardResourceApi,
    /**
     * The ChargingLogResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/ChargingLogResourceApi}
     */
    ChargingLogResourceApi: ChargingLogResourceApi,
    /**
     * The CompanyPropsResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/CompanyPropsResourceApi}
     */
    CompanyPropsResourceApi: CompanyPropsResourceApi,
    /**
     * The CompanyResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/CompanyResourceApi}
     */
    CompanyResourceApi: CompanyResourceApi,
    /**
     * The CouponResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/CouponResourceApi}
     */
    CouponResourceApi: CouponResourceApi,
    /**
     * The EndpointsApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/EndpointsApi}
     */
    EndpointsApi: EndpointsApi,
    /**
     * The HistoryResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/HistoryResourceApi}
     */
    HistoryResourceApi: HistoryResourceApi,
    /**
     * The InvoiceResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/InvoiceResourceApi}
     */
    InvoiceResourceApi: InvoiceResourceApi,
    /**
     * The MessageTemplateResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/MessageTemplateResourceApi}
     */
    MessageTemplateResourceApi: MessageTemplateResourceApi,
    /**
     * The OfferResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/OfferResourceApi}
     */
    OfferResourceApi: OfferResourceApi,
    /**
     * The ProfileInfoResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/ProfileInfoResourceApi}
     */
    ProfileInfoResourceApi: ProfileInfoResourceApi,
    /**
     * The ServiceInstanceResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/ServiceInstanceResourceApi}
     */
    ServiceInstanceResourceApi: ServiceInstanceResourceApi,
    /**
     * The ServiceOfferingResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/ServiceOfferingResourceApi}
     */
    ServiceOfferingResourceApi: ServiceOfferingResourceApi,
    /**
     * The ServiceResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/ServiceResourceApi}
     */
    ServiceResourceApi: ServiceResourceApi,
    /**
     * The SubscriberResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/SubscriberResourceApi}
     */
    SubscriberResourceApi: SubscriberResourceApi,
    /**
     * The SubsriptionResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/SubsriptionResourceApi}
     */
    SubsriptionResourceApi: SubsriptionResourceApi,
    /**
     * The UsageNotificationResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/UsageNotificationResourceApi}
     */
    UsageNotificationResourceApi: UsageNotificationResourceApi,
    /**
     * The UserResourceApi service constructor.
     * @property {module:com.kodfarki.subscreasy.client/UserResourceApi}
     */
    UserResourceApi: UserResourceApi
  };

  return exports;
}));

},{"./ApiClient":9,"./com.kodfarki.subscreasy.client.model/Address":10,"./com.kodfarki.subscreasy.client.model/Authority":11,"./com.kodfarki.subscreasy.client.model/Authorization":12,"./com.kodfarki.subscreasy.client.model/AuthorizedServicesResponse":13,"./com.kodfarki.subscreasy.client.model/Cancellation":14,"./com.kodfarki.subscreasy.client.model/ChargingLog":15,"./com.kodfarki.subscreasy.client.model/Company":16,"./com.kodfarki.subscreasy.client.model/CompanyProps":17,"./com.kodfarki.subscreasy.client.model/Coupon":18,"./com.kodfarki.subscreasy.client.model/Deduction":19,"./com.kodfarki.subscreasy.client.model/DeductionResult":20,"./com.kodfarki.subscreasy.client.model/History":21,"./com.kodfarki.subscreasy.client.model/Invoice":22,"./com.kodfarki.subscreasy.client.model/InvoiceRequest":23,"./com.kodfarki.subscreasy.client.model/ManagedUserVM":24,"./com.kodfarki.subscreasy.client.model/MessageTemplate":25,"./com.kodfarki.subscreasy.client.model/Offer":26,"./com.kodfarki.subscreasy.client.model/PaymentCard":27,"./com.kodfarki.subscreasy.client.model/ProfileInfoVM":28,"./com.kodfarki.subscreasy.client.model/RecurrencePeriod":29,"./com.kodfarki.subscreasy.client.model/ResponseEntity":30,"./com.kodfarki.subscreasy.client.model/SavedCard":31,"./com.kodfarki.subscreasy.client.model/Service":32,"./com.kodfarki.subscreasy.client.model/ServiceInstance":33,"./com.kodfarki.subscreasy.client.model/ServiceInstanceResult":34,"./com.kodfarki.subscreasy.client.model/ServiceOffering":35,"./com.kodfarki.subscreasy.client.model/ServiceOfferingResult":36,"./com.kodfarki.subscreasy.client.model/StartSubscriptionRequest":37,"./com.kodfarki.subscreasy.client.model/Subscriber":38,"./com.kodfarki.subscreasy.client.model/SubscriptionCreateResult":39,"./com.kodfarki.subscreasy.client.model/SubscriptionPlan":40,"./com.kodfarki.subscreasy.client.model/Subsription":41,"./com.kodfarki.subscreasy.client.model/UsageNotification":42,"./com.kodfarki.subscreasy.client.model/User":43,"./com.kodfarki.subscreasy.client/AnalyticsResourceApi":44,"./com.kodfarki.subscreasy.client/CardResourceApi":45,"./com.kodfarki.subscreasy.client/ChargingLogResourceApi":46,"./com.kodfarki.subscreasy.client/CompanyPropsResourceApi":47,"./com.kodfarki.subscreasy.client/CompanyResourceApi":48,"./com.kodfarki.subscreasy.client/CouponResourceApi":49,"./com.kodfarki.subscreasy.client/EndpointsApi":50,"./com.kodfarki.subscreasy.client/HistoryResourceApi":51,"./com.kodfarki.subscreasy.client/InvoiceResourceApi":52,"./com.kodfarki.subscreasy.client/MessageTemplateResourceApi":53,"./com.kodfarki.subscreasy.client/OfferResourceApi":54,"./com.kodfarki.subscreasy.client/ProfileInfoResourceApi":55,"./com.kodfarki.subscreasy.client/ServiceInstanceResourceApi":56,"./com.kodfarki.subscreasy.client/ServiceOfferingResourceApi":57,"./com.kodfarki.subscreasy.client/ServiceResourceApi":58,"./com.kodfarki.subscreasy.client/SubscriberResourceApi":59,"./com.kodfarki.subscreasy.client/SubsriptionResourceApi":60,"./com.kodfarki.subscreasy.client/UsageNotificationResourceApi":61,"./com.kodfarki.subscreasy.client/UserResourceApi":62}],64:[function(require,module,exports){
/**
 * Created with IntelliJ IDEA.
 * User: halil
 * Date: 28.06.2018 10:54
 */
var ApiDocumentation = require('api_documentation');

var defaultClient = ApiDocumentation.ApiClient.instance;

defaultClient.basePath = "https://sandbox.subscreasy.com";
console.log("defaultClient.basePath: " + defaultClient.basePath);

// Configure API key authorization: apiKey
var apiKey = defaultClient.authentications['apiKey'];
apiKey.apiKey = "YOUR API KEY"
// Uncomment the following line to set a prefix for the API key, e.g. "Token" (defaults to null)
//apiKey.apiKeyPrefix['Authorization'] = "Token"

var api = new ApiDocumentation.AnalyticsResourceApi()

var callback = function(error, data, response) {
    if (error) {
        console.error(error);
    } else {
        console.log('API called successfully. Returned data: ' + data);
    }
};
api.getDashboardAnalyticsUsingGET(callback);
},{"api_documentation":63}],65:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  for (var i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(
      uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)
    ))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],66:[function(require,module,exports){

},{}],67:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = {__proto__: Uint8Array.prototype, foo: function () { return 42 }}
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  get: function () {
    if (!(this instanceof Buffer)) {
      return undefined
    }
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  get: function () {
    if (!(this instanceof Buffer)) {
      return undefined
    }
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('Invalid typed array length')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (isArrayBuffer(value) || (value && isArrayBuffer(value.buffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  return fromObject(value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj) {
    if (ArrayBuffer.isView(obj) || 'length' in obj) {
      if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
        return createBuffer(0)
      }
      return fromArrayLike(obj)
    }

    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return fromArrayLike(obj.data)
    }
  }

  throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object.')
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (ArrayBuffer.isView(buf)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isArrayBuffer(string)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset  // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : new Buffer(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffers from another context (i.e. an iframe) do not pass the `instanceof` check
// but they should be treated as valid. See: https://github.com/feross/buffer/issues/166
function isArrayBuffer (obj) {
  return obj instanceof ArrayBuffer ||
    (obj != null && obj.constructor != null && obj.constructor.name === 'ArrayBuffer' &&
      typeof obj.byteLength === 'number')
}

function numberIsNaN (obj) {
  return obj !== obj // eslint-disable-line no-self-compare
}

},{"base64-js":65,"ieee754":68}],68:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],69:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],70:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],71:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":69,"./encode":70}]},{},[64]);
