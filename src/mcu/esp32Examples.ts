// MicroPython programs for the ESP32 DevKit, the counterparts of the ATmega
// examples: no compiler needed, the code can be edited in the app. Loops pause
// for 50 ms: MicroPython busy-waits the last tick (10 ms) of every sleep_ms,
// so short pauses keep the CPU busy and the emulation below real time.

export type Esp32ExampleId = 'blink' | 'button' | 'chaser' | 'dimmer' | 'serial' | 'demo' | 'lcd';

export const ESP32_EXAMPLES: { id: Esp32ExampleId; script: string }[] = [
  {
    id: 'blink',
    script: `from machine import Pin
import time

led = Pin(2, Pin.OUT)
while True:
    led.value(not led.value())
    time.sleep_ms(500)
`,
  },
  {
    id: 'button',
    script: `from machine import Pin
import time

led = Pin(2, Pin.OUT)
button = Pin(18, Pin.IN, Pin.PULL_UP)
while True:
    led.value(button.value() == 0)
    time.sleep_ms(50)
`,
  },
  {
    id: 'chaser',
    script: `from machine import Pin
import time

leds = [Pin(n, Pin.OUT) for n in (32, 33, 25, 26, 27, 14)]
while True:
    for led in leds:
        led.on()
        time.sleep_ms(150)
        led.off()
`,
  },
  {
    id: 'dimmer',
    script: `from machine import Pin, PWM, ADC
import time

pot = ADC(Pin(34), atten=ADC.ATTN_11DB)
led = PWM(Pin(4), freq=1000)
while True:
    led.duty_u16(pot.read_u16())
    time.sleep_ms(50)
`,
  },
  {
    id: 'serial',
    script: `print("Hallo von BlackBoard!")
while True:
    line = input()
    print("Echo:", line)
`,
  },
  {
    id: 'demo',
    script: `from machine import Pin, PWM, ADC
import time

led = Pin(2, Pin.OUT)
button = Pin(18, Pin.IN, Pin.PULL_UP)
dimmed = PWM(Pin(4), freq=1000)
pot = ADC(Pin(34), atten=ADC.ATTN_11DB)

last = time.ticks_ms()
while True:
    dimmed.duty_u16(pot.read_u16())
    pause = 125 if button.value() == 0 else 500
    if time.ticks_diff(time.ticks_ms(), last) >= pause:
        led.value(not led.value())
        last = time.ticks_ms()
    time.sleep_ms(50)
`,
  },
  {
    id: 'lcd',
    script: `from machine import Pin
import time

# LCD 16x2 (HD44780) im 4-Bit-Modus: RS, E und D4..D7, RW an GND
rs = Pin(21, Pin.OUT)
en = Pin(19, Pin.OUT)
data = [Pin(n, Pin.OUT) for n in (4, 0, 2, 15)]

def nibble(value):
    for bit, pin in enumerate(data):
        pin.value((value >> bit) & 1)
    en.value(1)
    en.value(0)          # fallende Flanke: das Display uebernimmt
    time.sleep_us(50)

def send(value, char=False):
    rs.value(char)
    nibble(value >> 4)
    nibble(value & 0x0F)

def init():
    time.sleep_ms(50)
    rs.value(0)
    for value in (3, 3, 3, 2):   # 8-Bit-Modus, dann 4-Bit-Modus
        nibble(value)
        time.sleep_ms(5)
    for cmd in (0x28, 0x0C, 0x01, 0x06):
        send(cmd)
    time.sleep_ms(2)

def show(text, line=0):
    send(0x80 | (0x40 * line))
    for c in text:
        send(ord(c), True)

init()
show("Hallo ESP32!")
start = time.ticks_ms()
while True:
    seconds = time.ticks_diff(time.ticks_ms(), start) // 1000
    show("Zeit:%5d s" % seconds, 1)
    time.sleep_ms(200)
`,
  },
];

export const esp32ExampleById = (id: string) => ESP32_EXAMPLES.find((e) => e.id === id);
