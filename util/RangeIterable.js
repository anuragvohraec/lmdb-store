const SKIP = {};
const DONE = {
	value: null,
	done: true,
}
if (!Symbol.asyncIterator) {
	Symbol.asyncIterator = Symbol.for('Symbol.asyncIterator');
}

export class RangeIterable {
	constructor(sourceArray) {
		if (sourceArray) {
			this.iterate = sourceArray[Symbol.iterator].bind(sourceArray);
		}
	}
	map(func) {
		let source = this;
		let result = new RangeIterable();
		result.iterate = (async) => {
			let iterator = source[Symbol.iterator](async);
			let i = 0;
			return {
				next(resolvedResult) {
					let result;
					do {
						let iteratorResult;
						if (resolvedResult) {
							iteratorResult = resolvedResult;
							resolvedResult = null; // don't go in this branch on next iteration
						} else {
							iteratorResult = iterator.next();
							if (iteratorResult.then) {
								return iteratorResult.then(iteratorResult => this.next(iteratorResult));
							}
						}
						if (iteratorResult.done === true) {
							this.done = true;
							return iteratorResult;
						}
						result = func(iteratorResult.value, i++);
						if (result && result.then) {
							return result.then(result =>
								result === SKIP ?
									this.next() :
									{
										value: result
									});
						}
					} while(result === SKIP)
					if (result === DONE) {
						return result;
					}
					return {
						value: result
					};
				},
				return() {
					return iterator.return();
				},
				throw() {
					return iterator.throw();
				}
			};
		};
		return result;
	}
	[Symbol.asyncIterator]() {
		return this.iterator = this.iterate();
	}
	[Symbol.iterator]() {
		return this.iterator = this.iterate();
	}
	filter(func) {
		return this.map(element => func(element) ? element : SKIP);
	}

	forEach(callback) {
		let iterator = this.iterator = this.iterate();
		let result;
		while ((result = iterator.next()).done !== true) {
			callback(result.value);
		}
	}
	concat(secondIterable) {
		let concatIterable = new RangeIterable();
		concatIterable.iterate = (async) => {
			let iterator = this.iterator = this.iterate();
			let isFirst = true;
			return {
				next() {
					let result = iterator.next();
					if (isFirst && result.done) {
						isFirst = false;
						iterator = secondIterable[Symbol.iterator](async);
						return iterator.next();
					}
					return result;
				},
				return() {
					return iterator.return();
				},
				throw() {
					return iterator.throw();
				}
			};
		};
		return concatIterable;
	}

	flatMap(callback) {
		let mappedIterable = new RangeIterable();
		mappedIterable.iterate = (async) => {
			let iterator = this.iterator = this.iterate(async);
			let isFirst = true;
			let currentSubIterator;
			return {
				next() {
					do {
						if (currentSubIterator) {
							let result = currentSubIterator.next();
							if (!result.done) {
								return result;
							}
						}
						let result = iterator.next();
						if (result.done)
							return result;
						let value = callback(result.value);
						if (Array.isArray(value) || value instanceof RangeIterable)
							currentSubIterator = value[Symbol.iterator]();
						else {
							currentSubIterator = null;
							return { value };
						}
					} while(true);
				},
				return() {
					if (currentSubIterator)
						currentSubIterator.return();
					return iterator.return();
				},
				throw() {
					if (currentSubIterator)
						currentSubIterator.throw();
					return iterator.throw();
				}
			};
		};
		return mappedIterable;
	}

	slice(start, end) {
		return this.map((element, i) => {
			if (i < start)
				return SKIP;
			if (i >= end) {
				DONE.value = element;
				return DONE;
			}
			return element;
		});
	}
	next() {
		if (!this.iterator)
			this.iterator = this.iterate();
		return this.iterator.next();
	}
	toJSON() {
		if (this.asArray && this.asArray.forEach) {
			return this.asArray;
		}
		throw new Error('Can not serialize async iteratables without first calling resolveJSON');
		//return Array.from(this)
	}
	get asArray() {
		if (this._asArray)
			return this._asArray;
		let promise = new Promise((resolve, reject) => {
			let iterator = this.iterate();
			let array = [];
			let iterable = this;
			Object.defineProperty(array, 'iterable', { value: iterable });
			function next(result) {
				while (result.done !== true) {
					if (result.then) {
						return result.then(next);
					} else {
						array.push(result.value);
					}
					result = iterator.next();
				}
				resolve(iterable._asArray = array);
			}
			next(iterator.next());
		});
		promise.iterable = this;
		return this._asArray || (this._asArray = promise);
	}
	resolveData() {
		return this.asArray;
	}
}
RangeIterable.prototype.DONE = DONE;