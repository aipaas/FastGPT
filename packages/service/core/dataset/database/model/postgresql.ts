import type {DatabaseConfig} from '@fastgpt/global/core/dataset/type'
import { AsyncDB } from './AsyncDB'
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';


export class PostgreSQLClient extends AsyncDB {
 static fromConfig(config: DatabaseConfig): PostgreSQLClient {
    const db = AsyncDB.from_uri(config)
    return new PostgreSQLClient(db, config);
  }
  override async checkConnection(): Promise<boolean> {
    try {
        await super.checkConnection();
        return true;
    } catch (err: any) {
    // postgresql error 
    if (err?.code === "28P01" || err?.code === "28000") {
        throw ERROR_RESPONSE[DatabaseErrEnum.authError];
    } else if (err?.code === "3D000") {
        throw ERROR_RESPONSE[DatabaseErrEnum.nameError];
    } else if (err?.code === "ENOTFOUND" || err?.code === "ETIMEDOUT" || err?.code === "ECONNREFUSED") {
        throw ERROR_RESPONSE[DatabaseErrEnum.addressError];
    } else {
        throw ERROR_RESPONSE[DatabaseErrEnum.checkError];
    }
    }
  }
}
