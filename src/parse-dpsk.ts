import assert from 'assert';
import fs, { unwatchFile } from 'fs';
import { dataPath, generateNumbers, minIndex } from './core';
import { concatGenerators, arrayToGenerator, noReturn, pullXValuesFromGenerator } from './generator-utils';

const debug = {
    log(this: unknown, ...a: any[]) {},
    dir(this: unknown, a: any) {}
};

interface ParseDpskOptions {
    name: string;
    sampleRate: string;
}
export function parseDpskHandler(args: ParseDpskOptions) {
    const {name, sampleRate} = args;
    const side = 'left';
    const input = fs.openSync(dataPath(name, `${ side }.${ sampleRate }.s8`), 'r');
    const inputStream = generateNumbers(input);
    const {indexOfPeak, itemsRead} = detectFirstPeak(inputStream);
    debug.dir({indexOfPeak, itemsRead});
    const amplitudeOfFirstPeak = itemsRead[indexOfPeak];
    const highAmplitude = amplitudeOfFirstPeak * 0.7;
    const lowAmplitude = amplitudeOfFirstPeak * 0.5;
    const inputStream2 = concatGenerators(arrayToGenerator(itemsRead.slice(indexOfPeak)), inputStream);

    for(const phase of generatePhases({
        generator: inputStream2,
        samplesPerPhase: 12,
        highAmplitude,
        lowAmplitude
    })) {
        console.log(phase);
    }
}

function detectFirstPeak(generator: Generator<number>, threshold: number = 50): {
    indexOfPeak: number;
    itemsRead: Array<number>;
} {
    const items = new Array<number>();
    let max: number = 0;
    for(const item of noReturn(generator)) {
        items.push(item);
        if(item < threshold) continue;
        max = item;
        break;
    }
    for(const item of noReturn(generator)) {
        items.push(item);
        if(item < max) break;
        max = item;
    }
    return {
        indexOfPeak: items.length - 2, // the previous sample is the peak
        itemsRead: items
    };
}

export type Phase = 'A' | 'B' | 'C' | 'D';
export const phases = ['A', 'B', 'C', 'D'] as const;

const categoryOrder: Array<SampleCategory> = ['ZeroRising', 'High', "ZeroDropping", 'Low', 'ZeroRising', "High"];

function* generatePhases(opts: {
    generator: Generator<number>;
    samplesPerPhase: number;
    highAmplitude: number;
    lowAmplitude: number;
}): Generator<Phase> {
    const {generator, samplesPerPhase, lowAmplitude, highAmplitude} = opts;
    debug.dir({lowAmplitude, highAmplitude});
    let offset = 0;
    let lastItems: Array<number> = [];
    let shouldShiftClock = 0;
    while(true) {
        const items = pullXValuesFromGenerator(generator, Math.ceil(samplesPerPhase) + shouldShiftClock);
        if(shouldShiftClock > 0) {
            items.splice(0, shouldShiftClock);
        } else if(shouldShiftClock < 0) {
            items.splice(0, 0, ...lastItems.slice(shouldShiftClock));
        }
        const startSample = getSample(items, 0 + offset);
        const quarterSample = getSample(items, samplesPerPhase / 4 + offset);
        const halfSample = getSample(items, samplesPerPhase / 2 + offset);
        debug.dir({
            items, 
            startSample,
            quarterSample,
            halfSample
        });
        const startSampleType = categorizeSample({sample: startSample, highAmplitude, lowAmplitude, samplesPerPhase});
        const quarterSampleType = categorizeSample({sample: quarterSample, highAmplitude, lowAmplitude, samplesPerPhase});
        const halfSampleType = categorizeSample({sample: halfSample, highAmplitude, lowAmplitude, samplesPerPhase});
        debug.dir({startSampleType, quarterSampleType, halfSampleType});
        FindPhase:
        {
            for(let i = 0; i < 4; i++) {
                if(
                    startSampleType === categoryOrder[i] &&
                    quarterSampleType === categoryOrder[i + 1] &&
                    halfSampleType === categoryOrder[i + 2]
                ) {
                    yield phases[i];
                    break FindPhase;
                }
            }
            console.dir({
                startSample, startSampleType, quarterSample, quarterSampleType, halfSample, halfSampleType,
                items,
            });
            throw 'Samples categories do not match a consistent phase.';
        }

        // Re-adjust our clock based on the first zero-crossing
        for(let i = 0; i < items.length; i++) {
            if(Math.sign(items[i]) != Math.sign(items[i + 1])) {
                // i is the index of a zero crossing
                const zeroCrossing = i + Math.abs(items[i] / (items[i] - items[i + 1]));
                const a = [0, samplesPerPhase / 4, samplesPerPhase / 2];
                const b = a.map(aVal => {
                    return {phase: aVal, distance: zeroCrossing - aVal};
                });
                const bestMatch = b[minIndex(b, v => Math.abs(v.distance))];

                // we know i should be at the phase indicated by bestMatch
                if(bestMatch.distance < -0.5) {
                    // we must shift clock backwards
                    shouldShiftClock = -1;
                } else if(bestMatch.distance > 0.5) {
                    // we must shift clock forward
                    shouldShiftClock = 1;
                } else {
                    shouldShiftClock = 0;
                }
                lastItems = items;
                debug.dir({zeroCrossing, a, b, bestMatch, shouldShiftClock});
                break;
            }
        }
    }
}

type SampleCategory = 'High' | 'Low' | 'ZeroRising' | 'ZeroDropping';
function categorizeSample(opts: {sample: Sample, highAmplitude: number, lowAmplitude: number, samplesPerPhase: number}): SampleCategory {
    const {sample: {value, slope}, highAmplitude, lowAmplitude, samplesPerPhase} = opts;
    if(value > highAmplitude) return 'High';
    if(value < -highAmplitude) return 'Low';
    if(Math.abs(value) < lowAmplitude) {
        if(slope > 0) return 'ZeroRising';
        if(slope < 0) return 'ZeroDropping';
        throw 'slope is zero; that shouldnt happen';
    }

    if(Math.abs(slope) > highAmplitude / samplesPerPhase / 4) {
        // slope is extreme enough we can assume a zero crossing
        return slope > 0 ? 'ZeroRising' : 'ZeroDropping';
    }
    throw 'value is neither high enough nor low enough to categorize; that shouldnt happen';
}

interface Sample {
    value: number;
    slope: number;
}

function getSample(items: Array<number>, index: number): Sample {
    assert(items.length >= 2);
    assert(index >= 0);
    let
        lowerIndex: number,
        upperIndex: number,
        slope: number,
        value: number;
    
    lowerIndex = Math.floor(index);
    upperIndex = lowerIndex + 1;
    if(upperIndex >= items.length) {
        // delta between last 2 values
        slope = items[items.length - 1] - items[items.length - 2];
        value = items[items.length - 1] + (index - items.length - 1) * slope;
    } else {
        assert(lowerIndex >= 0);
        slope = items[upperIndex] - items[lowerIndex];
        value = items[lowerIndex] + (index - lowerIndex) * slope;
    }
    return {value, slope};
}
