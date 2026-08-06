import { assertNotInTransaction } from '@/libs/prisma-connection.js';
import {
  GetParameterCommand,
  GetParametersCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';

// SSMクライアントの初期化
const ssmClient = new SSMClient({
  region: process.env.AWS_DEFAULT_REGION || 'ap-northeast-1',
});

/**
 * 単一のSSMパラメータを取得
 */
export async function getParameter(
  parameterName: string,
  withDecryption = true
): Promise<string> {
  try {
    const command = new GetParameterCommand({
      Name: parameterName,
      WithDecryption: withDecryption,
    });

    const response = await ssmClient.send(command);
    return response.Parameter?.Value || '';
  } catch (error) {
    console.error(
      `SSM parameter retrieval failed for ${parameterName}:`,
      error
    );
    throw error;
  }
}

/**
 * 複数のSSMパラメータを一度に取得
 */
export async function getParameters(
  parameterNames: string[],
  withDecryption = true
): Promise<Record<string, string>> {
  assertNotInTransaction('SSM パラメータ取得');
  try {
    const command = new GetParametersCommand({
      Names: parameterNames,
      WithDecryption: withDecryption,
    });

    const response = await ssmClient.send(command);
    const result: Record<string, string> = {};

    response.Parameters?.forEach((param) => {
      if (param.Name && param.Value) {
        result[param.Name] = param.Value;
      }
    });

    return result;
  } catch (error) {
    console.error('SSM parameters retrieval failed:', error);
    throw error;
  }
}

/**
 * 複数行テキストをファイルとして保存して取得
 */
export async function getParameterAsFile(
  parameterName: string,
  filePath: string
): Promise<string> {
  try {
    const content = await getParameter(parameterName);

    // ファイルに保存
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, content, 'utf8');

    return filePath;
  } catch (error) {
    console.error(
      `Failed to save parameter ${parameterName} to file ${filePath}:`,
      error
    );
    throw error;
  }
}

export { ssmClient };
