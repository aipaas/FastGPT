import type {DatabaseConfig} from '@fastgpt/global/core/dataset/type'
import { AsyncDB } from './AsyncDB'
import { DatabaseErrEnum } from '@fastgpt/global/common/error/code/database';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';


export class SQLiteClient extends AsyncDB {
 static fromConfig(config: DatabaseConfig): SQLiteClient {
    const db = AsyncDB.from_uri(config)
    return new SQLiteClient(db, config);
  }
  override async checkConnection(): Promise<boolean> {
    try {
        await super.checkConnection();
        return true;
    } catch (err: any) {
    // sqlite error handling
    if (err?.code === "SQLITE_AUTH") {
        throw ERROR_RESPONSE[DatabaseErrEnum.authError];
    } else if (err?.code === "SQLITE_CANTOPEN") {
        throw ERROR_RESPONSE[DatabaseErrEnum.nameError];
    } else if (err?.code === "ENOENT" || err?.code === "EACCES") {
        throw ERROR_RESPONSE[DatabaseErrEnum.addressError];
    } else {
        throw ERROR_RESPONSE[DatabaseErrEnum.checkError];
    }
    }
  }
}
