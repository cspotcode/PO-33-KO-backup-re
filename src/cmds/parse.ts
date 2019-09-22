import { Command } from "../yargs";
import fs from 'fs';
import { dataPath, generateNumbers } from "../core";
import { Bit, ZeroCrossing } from "../types-and-constants";
import { noReturn, arraysEqual, concatGenerators, arrayToGenerator, pullXValuesFromGenerator } from "../generator-utils";
import { GlobalArgs } from "../cli";

interface Args extends GlobalArgs {}
export const command = Command<Args>({
    command: 'parse',
    describe: 'Parse a backup into a phase dump',
    handler(args) {
        parsePhasesViaBits(args as unknown as {name: string, sampleRate: number});
    }
});

/**
 * Parse a raw file exported from Audacity.
 * Assumes raw file contains signed 8bit PCM, 48000Hz
 */
function parsePhasesViaBits(opts: {name: string, sampleRate: number}) {
    const {name, sampleRate} = opts;
    doIt('left');
    doIt('right');
    function doIt(side: 'left' | 'right') {
        console.log(`Opening input and output files`);
        const output = fs.openSync(dataPath(name, `${ side }.phases`), 'w');
        const input = fs.openSync(dataPath(name, `${ side }.${ sampleRate }.s8`), 'r');

        const bitStream = bitSpitter({input: generateNumbers(input), sampleRate});
        const phaseStream = bitsToPhases({bitStream});
        
        let lineLength = 0;
        for(const phase of phaseStream) {
            fs.writeSync(output, `${phase}`);
            lineLength++;
            if(lineLength === 80) {
                fs.writeSync(output, '\n');
                lineLength = 0;
            }
        }
        console.log(`Closing files`);
        fs.closeSync(input);
        fs.closeSync(output);
    }
}

function* bitsToPhases(opts: {bitStream: Generator<Bit>}) {
    const {bitStream} = opts;
    const bits = new Array<Bit>();
    // detect the first 11
    for(const bit of noReturn(bitStream)) {
        bits.push(bit);
        if(arraysEqual(bits.slice(-2), [1, 1])) {
            break;
        }
    }

    const rest = noReturn(concatGenerators(arrayToGenerator([1]), bitStream));
    while(true) {
        const bits = pullXValuesFromGenerator(rest, 2);
        pullXValuesFromGenerator(rest, 2);
        if(bits.length < 2) break;
        const b = ([
            [[1, 1], 'A'],
            [[1, 0], 'B'],
            [[0, 0], 'C'],
            [[0, 1], 'D']
        ] as const).find(([signature, phase]) => arraysEqual(bits, signature));
        if(!b) console.dir({Error: true, bits, b});
        yield b ? b[1] : '-';
    }
}

/**
 * Take a stream of audio samples and spit out a stream of high/low bits based on zero-crossings of the audio
 */
export function bitSpitter(opts: {input: Generator<number>, sampleRate: number}) {
    const {sampleRate, input} = opts;
    const poEncodingSampleRateHz = 7800 * 4;
    const samplesPerBit = sampleRate / poEncodingSampleRateHz;
    const maxUncertainty = 1/4;
    const bitStream = zeroCrossingsToBits({
        zeroCrossings: generateZeroCrossings(
            input
        ),
        maxUncertainty,
        samplesPerBit
    });
    return bitStream;
}

function* zeroCrossingsToBits(opts: {
    zeroCrossings: Generator<ZeroCrossing>,
    maxUncertainty: number,
    samplesPerBit: number
}): Generator<Bit> {
    const {maxUncertainty, samplesPerBit, zeroCrossings} = opts;
    let skip = 0;
    for(const {side, timestamp, delta} of zeroCrossings) {
        const numberOfBitsFractional = delta / samplesPerBit;
        const numberOfBits = Math.round(numberOfBitsFractional);
        // Uncertainty of 0.5 means it's smack in the middle, between two possible counts of bits.
        // (For example, the delta time is halfway between the time it takes for 2 bits and for 3 bits)
        // That is bad because it means we don't have any idea what number of bits was being encoded.
        // Or it means our assumptions about the bit-rate or encoding format are totally wrong.
        const uncertainty = (numberOfBits - numberOfBitsFractional) / samplesPerBit;
        if(Math.abs(uncertainty) > maxUncertainty)
            console.log('High uncertainty: ' + uncertainty);
        const bit = side === 1 ? 0 : 1;
        if(skip) {
            console.dir({side, crossingTimestamp: timestamp, crossingDelta: delta});
            skip--;
            continue;
        }
        for(let i = 0; i < numberOfBits; i++) {
            yield bit;
        }
    }
}

function* generateZeroCrossings(generator: Generator<number, void, unknown>): Generator<ZeroCrossing, void, unknown> {
    const threshold = 10;
    let i = -1;
    let negativeIndex = 0;
    let negativeValue = 0;
    let positiveIndex = 0;
    let positiveValue = 0;
    let lastSeenAboveAxis = true;
    let lastCrossing = 0;
    let f = 2;
    function computeCrossing({
        beforeIndex, beforeValue, afterIndex, afterValue
    }: {beforeIndex: number, beforeValue: number, afterIndex: number, afterValue: number}) {
        // HACK if these are the first crossings
        if(beforeIndex === 0) return afterIndex - 0.5;
        const percentageOfTimeBeforeCrossing = beforeValue / (beforeValue - afterValue);
        const crossingTime = beforeIndex + percentageOfTimeBeforeCrossing * (afterIndex - beforeIndex);
        // if(Math.abs(beforeIndex - afterIndex) > 2) {
        // if(f) {
        //     f--;
        //     console.dir({
        //         beforeIndex, beforeValue,
        //         afterIndex, afterValue,
        //         percentageOfTimeBeforeCrossing,
        //         crossingTime
        //     });
        // }
        return crossingTime;
    }
    for(const number of generator) {
        i++;
        // Skip values too close to 0
        if(Math.abs(number) < threshold) continue;
        if(number < 0) {
            // is negative number
            negativeIndex = i;
            negativeValue = number;
            // if is transition to negative
            if(lastSeenAboveAxis) {
                lastSeenAboveAxis = false;
                const crossingTime = computeCrossing({
                    beforeIndex: positiveIndex,
                    beforeValue: positiveValue,
                    afterIndex: negativeIndex,
                    afterValue: negativeValue
                });
                yield {side: -1, timestamp: crossingTime, delta: lastCrossing === 0 ? 0 : crossingTime - lastCrossing};
                lastCrossing = crossingTime;
            }
        } else {
            // is positive number
            positiveIndex = i;
            positiveValue = number;
            // if is transition to positive
            if(!lastSeenAboveAxis) {
                lastSeenAboveAxis = true;
                const crossingTime = computeCrossing({
                    beforeIndex: negativeIndex,
                    beforeValue: negativeValue,
                    afterIndex: positiveIndex,
                    afterValue: positiveValue
                });
                yield {side: 1, timestamp: crossingTime, delta: lastCrossing === 0 ? 0 : crossingTime - lastCrossing};
                lastCrossing = crossingTime;
            }
        }
    }
}