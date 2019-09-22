import Path from 'path';
import fs from 'fs';

export function dataPath(name: string, filename?: string) {
    if(filename == null) {
        return Path.join(__dirname, '..', 'data', name);
    } else {
        return Path.join(__dirname, '..', 'data', name, filename);
    }
}

/**
 * emit an input FD one byte at a time
 * @deprecated
 */
export function* generateNumbers(input: number): Generator<number> {
    const inputBuffer = Buffer.alloc(100);
    // const outputBuffer = new Buffer(100);
    while(true) {
        const length = fs.readSync(input, inputBuffer, 0, 100, null);
        if(length === 0) break;

        for(const number of new Int8Array(inputBuffer.slice(0, length))) {
            yield number;
        }
    }
}

export function minIndex<T>(items: ReadonlyArray<T>, getter: (v: T) => number) {
    let minIndex = 0;
    let minValue = Infinity;
    for(let i = 0, l = items.length; i < l; i++) {
        const item = items[i];
        const v = getter(item);
        if(v < minValue) {
            minValue = v;
            minIndex = i;
        }
    }
    return minIndex;
}