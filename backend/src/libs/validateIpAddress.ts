import { ServerError } from '@/libs/appError.js';

export const validateIpAddress = ({
  ipAddress,
  expression,
}: {
  ipAddress: string;
  expression: string;
}): boolean => {
  if (!ipAddress.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    throw new ServerError(`Invalid IP address input: ${ipAddress}`);
  }
  for (const part of ipAddress.split('.')) {
    if (Number(part) > 255) {
      throw new ServerError(`Invalid IP address input: ${ipAddress}`);
    }
  }

  const expressions = expression.split(',');
  for (const exp of expressions) {
    // 単一IPアドレス
    if (exp.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      if (exp === ipAddress) {
        return true;
      }
      continue;
    }

    // 範囲指定
    if (exp.match(/^\d+(-\d+)?\.\d+(-\d+)?\.\d+(-\d+)?\.\d+(-\d+)?$/)) {
      const expParts = exp.split('.');
      const ipParts = ipAddress.split('.');
      let isMatch = true;
      for (let i = 0; i < expParts.length; i++) {
        const expPart = expParts[i]!;
        const ipPart = Number(ipParts[i]);
        if (ipPart > 255) {
          throw new ServerError(`Invalid IP address input: ${ipAddress}`);
        }
        const match = expPart.match(/^(\d+)-(\d+)$/);
        if (match) {
          const min = Number(match[1]);
          const max = Number(match[2]);
          if (min > 255 || max > 255) {
            throw new ServerError(`Invalid IP address expression: ${exp}`);
          }
          if (ipPart < min || ipPart > max) {
            isMatch = false;
            break;
          }
        } else {
          if (ipPart !== Number(expPart)) {
            isMatch = false;
            break;
          }
        }
      }
      if (isMatch) {
        return true;
      }
      continue;
    }

    // サブネット
    {
      const match = exp.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
      if (match) {
        const expIpString = match[1]!;
        // exp の IP アドレスを 32 ビット整数に変換
        const expParts = expIpString.split('.').map(Number);
        if (expParts.some((part) => part > 255)) {
          throw new ServerError(`Invalid IP address expression: ${exp}`);
        }
        const expIp =
          (expParts[0]! << 24) |
          (expParts[1]! << 16) |
          (expParts[2]! << 8) |
          expParts[3]!;
        // マスクビット数
        const expMask = 32 - Number(match[2]);
        if (expMask < 0) {
          throw new ServerError(`Invalid IP address expression: ${exp}`);
        }
        // ((1 << 32) - 1) が 0 になっちゃうので特別処理
        if (expMask === 32) {
          if (expIp !== 0) {
            throw new ServerError(`Invalid IP address expression: ${exp}`);
          }
          return true;
        }
        // expIp の下位 expMask ビットが 0 でなかったら不正なサブネット設定
        if (expIp & ((1 << expMask) - 1)) {
          throw new ServerError(`Invalid IP address expression: ${exp}`);
        }

        // ipAddress を 32 ビット整数に変換
        const ipParts = ipAddress.split('.').map(Number);
        if (ipParts.some((part) => part > 255)) {
          throw new ServerError(`Invalid IP address input: ${ipAddress}`);
        }
        const ipIp =
          (ipParts[0]! << 24) |
          (ipParts[1]! << 16) |
          (ipParts[2]! << 8) |
          ipParts[3]!;

        // expIp と ipIp を expMask ビットぶん右シフト
        const expIpRight = expIp >> expMask;
        const ipIpRight = ipIp >> expMask;

        if (expIpRight === ipIpRight) {
          return true;
        }
        continue;
      }
    }

    // その他
    throw new ServerError(`Invalid IP address expression: ${exp}`);
  }
  return false;
};
