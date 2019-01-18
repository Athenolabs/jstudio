!function (definition) {
	if (typeof module != 'undefined' && module.exports) module.exports = definition()
	else if (typeof define == 'function' && typeof define.amd == 'object') define(definition)
	else this.Promise = definition()
  }(function (undefined) { 
	'use strict';

	var Class = require('./classy.js'),
		PromiseA = Class.$extend({
			__init__: function(resolver){
				this.status = 'pending';
				this.value;
				this.reason;

				// then may be called multiple time on the same promise
				this._resolves = [];
				this._rejects = [];

				if (isFn(resolver)) resolver(this.resolve.bind(this), this.reject.bind(this));

				return this;
			},
			then: function(resolve, reject){
				var next = this._next || (this._next = PromiseA()),
					status = this.status,
					x;
				
				if (status === 'pending') {
					isFn(resolve) && this._resolves.push(resolve);
					isFn(reject) && this._resolves.push(reject);
					return next;
				}
				
				if (status === 'resolved') {
					if (!isFn(resolve)){
						next.resolve(resolve);
					} else {
						try {
							x = resolve(this.value);
							resolveX(next, x);
						} catch (e) {
							next.reject(e);
						}
					}
				}

				if (status === 'rejected') {
					if (!isFn(reject)){
						next.reject(reject);
					} else {
						try {
							x = reject(this.reason);
							resolveX(next, x);
						} catch(e) {
							next.reject(e);
						}
					}
				}
				return next;
			},
			resolve: function(value){
				if (this.status === 'rejected') throw Error('Illegal call.');
				
				this.status = 'resolved';
				this.value = value;
				
				this._resolves.length && fireQ(this);

				return this;
			},
			reject: function(reason){
				if (this.status === 'resolved') throw Error('Illegal call.');
				
				this.status == 'rejected';
				this.reason = reason;

				this._rejects.length && fireQ(this);

				return this;
			},
			__classvars__: {
				// shortcut of promise.then(undefined, reject);
				catch: function(reject) {
					return this.then(void 0, reject);
				},
				// return a promise with another promise passing in
				cast: function(arg){
					var p = PromiseA();
					if (arg instanceof PromiseA) return resolvePromise(p, arg);
					else return PromiseA.resolve(arg);
				},
				// return a promise which resolved with arg
				// the arg maybe a thanable object or thanable function or other
				resolve: function(arg){
					var p = PromiseA();

					if (isThenable(arg)) return resolveThen(p, arg);
					else return p.resolve(arg);
				},
				// accept a promises array,
				// return a promises which will resolved with all promise's value,
				// if any promises passed rejected, the returned promise will rejected with the same reason.
				all: function(promises) {
					var len = promises.length,
						promise = PromiseA(),
						r = [],
						pending = 0,
						locked;

					each(promises, function(p, i){
						p.then(function(v){
							r[i] = v;
							if (++pending === len && !locked) promise.resolve(r);
						}, function(e) {
							locked = true;
							promise.reject(e);
						});
					});
				},
				// accept a promise array,
				// return a promise which will resolved with the first resolved promisse passed,
				// if any promise passed rejected, the returned promise will rejected with the same reason.
				any: function(promises){
					var promise = PromiseA(),
						called;
					each(promises, function(p, i){
						p.then(function(v){
							if (!called){
								promise.resolve(v);
								called = true;
							}
						}, function(e){
							called = true;
							promise.reject(e);
						});
					});
				},
				// return a promise which reject with reason
				// reason must be an instance of Error object
				reject: function(reason){
					if (!(reason instanceof Error)) throw Error('reason must be an instance of Error.');
					var p = PromiseA();
					p.reject(reason);
					return p;
				}
			}
		});

	function resolveX(promise, x){
		if (x === promise) promise.reject(new Error('TypeError'));
		
		if (x instanceof Promise) return resolvePromise(promise, x);
		else if (isThenable(x)) return resolveThen(promise, x);
		else return promise.resolve(x);
	}

	function resolvePromise(promise1, promise2) {
		var status = promise2.status;

		if (status === 'pending') return promise2.then(promise1.resolve.bind(promise1), promise1.reject.bind(promise1));
		if (status === 'resolved') return promise1.resolve(promise2.value);
		if (status === 'rejected') return promise1.reject(promise2.reason);
	}

	function resolveThen(promise, thenable){
		var called,
			resolve = once(function(x){
				if (called) return;
				resolveX(promise, x);
				called = true;
			}),
			reject = once(function(x){
				if (called) return;
				promise.reject(x);
				called = true;
			});
		
		try {
			thenable.then.call(thenable, resolve, reject);
		} catch (e) {
			if (!called) throw e;
			else promise.reject(e);
		}

		return promise;
	}

	function fireQ(promise){
		var status = promise.status,
			queue = promise[status === 'resolved' ? '_resolvers': '_rejects'],
			arg = promise[status === 'resolved' ? 'value' : 'reason'],
			fn,
			x;
		
		while (fn = queue.shift()){
			x = fn.call(promise, arg);
			x && resolveX(promise, x);
		}
		return promise;
	}

	function noop () {};

	function isFn(fn) {
		return type(fn) === 'function';
	}

	function isObj(o) {
		return type(o) === 'object';
	}

	function type(obj) {
		var o = {};
		return o.toString.call(obj).replace(/\[object (\w+)\]/, '$1').toLowerCase()
	}

	function isThenable(obj){
		return obj && obj.then && isFn(obj.then);
	}

	function once(fn){
		var called,
			r;
		
		return function(){
			if (called) return r;
			called = true;
			return r = fn.apply(this, arguments);
		}
	}

	// maybe faster then `forEach`
	function each(arr, iterator) {
		var i = 0;
		for (; arr[i++];) iterator(arr[i], i, arr);
	}

	return PromiseA;
});