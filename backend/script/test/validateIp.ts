import { validateIpAddress } from '@/libs/validateIpAddress.js';

const data = [
  {
    ipAddress: '123.123.0.1',
    expression: '0.0.0.0/0',
    expected: 'true',
  },
  {
    ipAddress: '255.123.0.1',
    expression: '0.0.0.0/0',
    expected: 'true',
  },
  {
    ipAddress: '255.123.0.1',
    expression: '192.168.0.*',
    expected: 'exception',
  },
  {
    ipAddress: '192.168.1.1',
    expression: '192.168.1.1',
    expected: 'true',
  },
  {
    ipAddress: '192.168.1.2',
    expression: '192.168.1.1',
    expected: 'false',
  },
  {
    ipAddress: '192.168.1.100',
    expression: '192.168.1.1/24',
    expected: 'exception',
  },
  {
    ipAddress: '192.168.1.100',
    expression: '192.168.1.0/24',
    expected: 'true',
  },
  {
    ipAddress: '192.168.1.0',
    expression: '192.168.1.127/25',
    expected: 'exception',
  },
  {
    ipAddress: '192.168.1.0',
    expression: '192.168.1.128/25',
    expected: 'false',
  },
  {
    ipAddress: '192.168.1.0',
    expression: '192.168.1.129/25',
    expected: 'exception',
  },
  {
    ipAddress: '192.168.1.127',
    expression: '192.168.1.128/25',
    expected: 'false',
  },
  {
    ipAddress: '192.168.1.255',
    expression: '192.168.1.128/25',
    expected: 'true',
  },
  {
    ipAddress: '192.168.2.7',
    expression: '192.168.1.12,192.168.2.7,192.168.3.0/24',
    expected: 'true',
  },
  {
    ipAddress: '192.168.1.10',
    expression: '192.168.1.12,192.168.2.7,192.168.3.0/24',
    expected: 'false',
  },
  {
    ipAddress: '192.168.3.127',
    expression: '192.168.1.12,192.168.2.7,192.168.3.0/24',
    expected: 'true',
  },
  {
    ipAddress: '192.168.3.9',
    expression: '192.168.1.12,192.168.2.7,192.168.3.10-24',
    expected: 'false',
  },
  {
    ipAddress: '192.168.3.10',
    expression: '192.168.1.12,192.168.2.7,192.168.3.10-24',
    expected: 'true',
  },
  {
    ipAddress: '192.168.3.24',
    expression: '192.168.1.12,192.168.2.7,192.168.3.10-24',
    expected: 'true',
  },
  {
    ipAddress: '192.168.1.24',
    expression: '192.168.1.12,192.168.2.7,192.168.3.10-24',
    expected: 'false',
  },
  {
    ipAddress: '192.168.3.25',
    expression: '192.168.1.12,192.168.2.7,192.168.3.10-24',
    expected: 'false',
  },
];

for (const test of data) {
  const { ipAddress, expression, expected } = test;
  let result = false;
  let exception = false;
  try {
    result = validateIpAddress({ ipAddress, expression });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    exception = true;
  }

  const isPass =
    (expected === 'true' && result === true && exception === false) ||
    (expected === 'false' && result === false && exception === false) ||
    (expected === 'exception' && exception === true);

  console.log(
    `${isPass ? 'PASS' : 'FAIL'} ${ipAddress.padEnd(
      15
    )} ${expected.padEnd(9)} ${(exception
      ? 'exception'
      : result.toString()
    ).padEnd(9)} <= ${expression}`
  );
}
