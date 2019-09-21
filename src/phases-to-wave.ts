import { Phase } from "./parse-dpsk";
import assert from 'assert';
import Speaker from '@cspotcode/speaker';
import fs from "fs";
import { numbersToArrayBuffers, arrayBuffersToNodeBuffers, generatorToStream, buffersToFile, fileToBuffers, buffersToInt8Arrays, typedArraysToNumbers, buffersToUint8Arrays } from "./generator-utils";
import { Readable } from "stream";
import { dataPath } from "./core";

const hz = 7800;
const sampleRate = 44100;
const PI = Math.PI;
function* phasesToAudioSamples(opts: {input: Generator<Phase>, amplitude: number}) {
    const {amplitude, input} = opts;
    const samplesPerCycle = sampleRate / hz;
    const sampleToRadians = 2 * PI / samplesPerCycle;

    let sampleIndex = 0;
    let radiansStart = 0;
    let thisPhase = input.next().value;
    while(true) {
        const nextPhase = input.next().value;
        if(!nextPhase) return;
        while(true) {
            const radians = sampleIndex * sampleToRadians;
            if(radians > radiansStart + 2 * PI) break;

            const mixValue = getEnvelopeValue(radians - radiansStart);
            const thisPhaseValue = getOscillatorValue(thisPhase, radians);
            const nextPhaseValue = getOscillatorValue(nextPhase, radians);
            const sample = mix(mixValue, thisPhaseValue, nextPhaseValue);
            yield Math.round(sample * amplitude);

            sampleIndex++;
        }
        radiansStart += 2 * PI;

        thisPhase = nextPhase;
    }

    function getEnvelopeValue(radians: number): number {
        const start = 1.2 * PI;
        const end = 1.8 * PI;
        if(radians < start) {
            return 0;
        }
        if(radians > end) {
            return 1;
        }
        return (radians - start) / (end - start);
    }

    function getOscillatorValue(phase: Phase, radians: number) {
        switch(phase) {
            case 'A':
                return Math.sin(radians);
            case 'B':
                return Math.cos(radians);
            case 'C':
                return -Math.sin(radians);
            case 'D':
                return -Math.cos(radians);
        }
    }

    function mix(
        /** from 0 (all valueA) to 1 (all valueB) or anywhere in-between */
        mixAmount: number,
        valueA: number,
        valueB: number
    ) {
        return valueA * (1 - mixAmount) + valueB * mixAmount;
    }
}

async function main() {
    const name = 'empty-baseline';
    doIt('left');
    doIt('right');
    function doIt(side: 'left' | 'right') {
        const inputPhases = fs.openSync(dataPath(name, `${side}.96000.phases`), 'r');
        function *phaseSpitter() {
            for(const item of typedArraysToNumbers(buffersToUint8Arrays(fileToBuffers(inputPhases)))) {
                const str = String.fromCharCode(item);
                if('ABCD'.includes(str)) {
                    yield str as Phase;
                }
            }
        }
        const audioGenerator = phasesToAudioSamples({
            amplitude: 120 << 8, 
            input: phaseSpitter()
        });
        const speaker = new Speaker({
            bitDepth: 16,
            channels: 1,
            sampleRate,
            signed: true
        });
        const generator = arrayBuffersToNodeBuffers(
            numbersToArrayBuffers(audioGenerator, new Int16Array(100))
        );
        const stream = Readable.from(
            generator
        );
        // stream.pipe(speaker);
        const output = fs.openSync(dataPath(name, `${side}.reconstituted.${sampleRate}.s16`), 'w');
        buffersToFile(generator, output);
    }
}

main();