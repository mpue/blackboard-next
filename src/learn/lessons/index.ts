// All lessons of the learning path, in learning order.

import type { Lesson } from '../types.ts';
import { ANALOG } from './analog.ts';
import { BASICS } from './basics.ts';
import { DIGITAL } from './digital.ts';
import { PCB } from './pcb.ts';
import { SEMICONDUCTORS } from './semiconductors.ts';

export const LESSONS: Lesson[] = [...BASICS, ...SEMICONDUCTORS, ...ANALOG, ...DIGITAL, ...PCB];
