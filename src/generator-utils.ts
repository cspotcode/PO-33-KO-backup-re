import { Readable } from "stream";
import fs from "fs";
import assert from "assert";

/**
 * Concat 2 generators into one.
 * Return value of generator1 is swallowed.
 */
export function* concatGenerators<GeneratedItem, ReturnValue, ReceivesFromYield>(
    generator1: Generator<GeneratedItem, unknown, ReceivesFromYield>,
    generator2: Generator<GeneratedItem, ReturnValue, ReceivesFromYield>
): Generator<GeneratedItem, ReturnValue, ReceivesFromYield> {
    let input: ReceivesFromYield = undefined as any;
    let first = true;
    while(true) {
        const nextResult = first ? generator1.next() : generator1.next(input);
        first = false;
        if(nextResult.done) {
            break;
        } else {
            input = yield nextResult.value;
        }
    }
    first = true;
    while(true) {
        const nextResult = first ? generator2.next() : generator2.next(input);
        first = false;
        if(nextResult.done) {
            return nextResult.value;
        } else {
            input = yield nextResult.value;
        }
    }
}

/**
 * Wrap a generator so that the wrapped generator is protected from termination.
 * The returned generator may be terminated, but the wrapped generator will *not* be told
 * to terminate.  Useful when you want to pipe data out of a generator in a for() loop,
 * break the loop, and later resume reading from the generator.
 */
export function* noReturn<T, U, V>(generator: Generator<T, U, V>): Generator<T, U, V> {
    let v: V = undefined as any;
    let errorToThrow = undefined;
    let shouldThrow = false;
    while(true) {
        let nextResult = shouldThrow ? generator.throw(errorToThrow) : generator.next(v);
        // Errors thrown from the wrapped generator will not be caught and will be thrown by us.
        // This is what we want.

        if(nextResult.done) return nextResult.value;
        try {
            v = yield nextResult.value;
        } catch(e) {
            errorToThrow = e;
            shouldThrow = true;
        }
    }
}

export function dupeGenerator_TODO<T, U, V>(generator: Generator<T, U, V>) {
    // As soon as next() is called on *one* of the outputs, it's passed to the source.
    // If next() is called again
}

export function pullXValuesFromGenerator<T>(generator: Generator<T>, count: number): Array<T> {
    const items: T[] = [];
    for(const item of noReturn(generator)) {
        items.push(item);
        if(items.length >= count) break;
    }
    return items;
}

export function generatorShift<T>(generator: Generator<T>): T | undefined {
    const n = generator.next();
    if(n.done) return;
    return n.value;
}

export function arraysEqual<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function* arrayToGenerator<T>(array: ReadonlyArray<T>) {
    for(const i of array) {
        yield i;
    }
}

export function* pipeGenerators<T, R, RT>(
    source: Generator<T, void, void>,
    receiver: Generator<RT, R, T | undefined>
): Generator<RT, R, void> {
    for(const item of source) {
        const r = receiver.next(item);
        if(r.done) return r.value;
    }
    while(true) {
        const r = receiver.next(undefined);
        if(r.done) return r.value;
        yield r.value;
    }
}

type TypedArrayLike = {
    length: number;
    [index: number]: number;
    buffer: ArrayBufferLike;
    [Symbol.iterator](): Iterator<number>;
}

/** Reuses the array buffer, so the receiver must copy it! */
export function* numbersToArrayBuffers(stream: Generator<number>, typedArray: TypedArrayLike): Generator<ArrayBuffer> {
    // TODO can we reuse the buffer?  When written to a stream, does the stream make a copy of the buffer?
    let indexToWrite = 0;
    const length = typedArray.length;
    for(const item of stream) {
        typedArray[indexToWrite++] = item;
        if(indexToWrite === length) {
            yield typedArray.buffer;
            indexToWrite = 0;
        }
    }
    yield typedArray.buffer.slice(0, indexToWrite);
}

export function* arrayBuffersToNodeBuffers(input: Generator<ArrayBuffer>) {
    for(const ab of input) {
        yield Buffer.from(ab);
    }
}

export function generatorToStream(input: Generator<Buffer>): Readable {
    return Readable.from(input);
}
export async function* streamToGenerator(input: Readable): AsyncGenerator<Buffer> {
    for await(const item of input) {
        yield item;
    }
}

/** Generator that emits a file synchronously, closing it upon termination. */
export function* fileToBuffers(input: number, bufferSize = 100): Generator<Buffer> {
    try {
        const buffer = Buffer.alloc(bufferSize);
        while(true) {
            const amtRead = fs.readSync(input, buffer, 0, 100, null);
            if(amtRead === 0) return;
            yield Buffer.from(buffer.slice(0, amtRead));
        }
    } finally {
        fs.closeSync(input);
    }
}
/** Generator that emits a file synchronously, closing it upon termination. */
export function buffersToFile(input: Generator<Buffer>, output: number, bufferSize = 100) {
    try {
        for(const b of input) {
            fs.writeSync(output, b);
        }
    } finally {
        fs.closeSync(output);
    }
}

export function buffersToInt16Arrays(input: Generator<Buffer>, sampleSize = 100): Generator<Int16Array> {
    return impl(input, sampleSize, Int16Array) as any;
}
export function buffersToInt8Arrays(input: Generator<Buffer>, sampleSize = 100): Generator<Int8Array> {
    return impl(input, sampleSize, Int8Array) as any;
}
export function buffersToUint8Arrays(input: Generator<Buffer>, sampleSize = 100): Generator<Uint8Array> {
    return impl(input, sampleSize, Uint8Array) as any;
}
interface TypedArrayCtor {
    BYTES_PER_ELEMENT: number;
    new(len: number | ArrayBuffer): TypedArrayLike & {
        byteLength: number
    }
}
function* impl(input: Generator<Buffer>, sampleSize: number, Ctor: TypedArrayCtor) {
    const bytesPerSample = Ctor.BYTES_PER_ELEMENT;
    let next = new Ctor(sampleSize);
    const {byteLength} = next;
    let nextAsUint8 = new Uint8Array(next.buffer);
    let buffers: Buffer[] = [];
    let bufferedBytes = 0;
    
    for(const buffer of input) {
        buffers.push(Buffer.from(buffer));
        bufferedBytes += buffer.length;
        while(bufferedBytes >= byteLength) {
            const concat = Buffer.concat(buffers);
            concat.copy(nextAsUint8, 0, 0, byteLength);
            yield next;
            next = new Ctor(sampleSize);
            nextAsUint8 = new Uint8Array(next.buffer);
            buffers = [concat.slice(byteLength)];
            bufferedBytes = buffers[0].length;
        }
    }
    // Send the remaining buffer
    assert(bufferedBytes <= byteLength);
    const bytesToSend = bufferedBytes - (bufferedBytes % bytesPerSample);
    const concat = Buffer.concat(buffers);
    const ab = new ArrayBuffer(bytesToSend);
    concat.copy(new Uint8Array(ab));
    yield new Ctor(ab);
}

export function* typedArraysToNumbers(input: Generator<TypedArrayLike>): Generator<number> {
    for(const ta of input) {
        for(const n of ta) {
            yield n;
        }
    }
}

export function* generatorMap<T, V>(generator: Generator<T>, cb: (t: T) => V): Generator<V> {
    for(const item of generator) {
        yield cb(item);
    }
}