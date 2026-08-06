import { client } from '@/libs/api';
import React from 'react';

type ResponseTime = {
  title: string;
  responseTime: number;
};

export const RemoteIp = () => {
  // 計測ループは TanStack を通さず素の client.GET を直呼びする(キャッシュ・スピナー・
  // トーストは計測に有害。serializer / ヘッダは client 側で自動適用される)。
  const isFirstTimeRef = React.useRef(true);
  const [remoteIp, setRemoteIp] = React.useState<string>('');
  const [xForwardedFor, setXForwardedFor] = React.useState<string>('');
  const [responseTimes, setResponseTimes] = React.useState<ResponseTime[]>([]);

  React.useEffect(() => {
    if (isFirstTimeRef.current === true) {
      isFirstTimeRef.current = false;
    } else {
      return;
    }

    setTimeout(() => {
      (async () => {
        const res = await client.GET('/api/debug/remoteIp');
        if (res.data) {
          setRemoteIp(res.data.remoteIp);
          setXForwardedFor(res.data.xForwardedFor);
        }
        const responseTimes: ResponseTime[] = [];
        const t01 = performance.now();
        for (let i = 0; i < 5; i++) {
          const t1 = performance.now();
          const res = await client.GET('/api/debug/remoteIp', {
            params: { query: { dummyDataLength: 1024 } },
          });
          const t2 = performance.now();
          if (res.data) {
            responseTimes.push({ title: '1KB', responseTime: t2 - t1 });
          }
        }
        const t02 = performance.now();
        responseTimes.push({
          title: '1KB x 5',
          responseTime: t02 - t01,
        });
        for (let i = 0; i < 5; i++) {
          const t1 = performance.now();
          const res = await client.GET('/api/debug/remoteIp', {
            params: { query: { dummyDataLength: 1024 * 1024 } },
          });
          const t2 = performance.now();
          if (res.data) {
            responseTimes.push({ title: '1MB', responseTime: t2 - t1 });
          }
        }
        const t03 = performance.now();
        responseTimes.push({
          title: '1MB x 5',
          responseTime: t03 - t02,
        });
        setResponseTimes(responseTimes);
      })();
    }, 100);
  }, [isFirstTimeRef]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <table>
        <tbody>
          <tr>
            <th style={{ textAlign: 'right' }}>remoteIp：</th>
            <td>{remoteIp || '-'}</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'right' }}>xForwardedFor：</th>
            <td>{xForwardedFor || '-'}</td>
          </tr>
          <tr>
            <td>&nbsp;</td>
          </tr>
          {responseTimes.map((responseTime) => (
            <tr key={`${responseTime.title}-${responseTime.responseTime}`}>
              <th style={{ textAlign: 'right' }}>{responseTime.title}：</th>
              <td>{Math.round(responseTime.responseTime)}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
