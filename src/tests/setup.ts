// Global test setup — prevents stderr spam from historyPath() when SEQ_SERVER_URL is unset
process.env.SEQ_SERVER_URL = "http://seq.test";
