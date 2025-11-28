import axios, { type Method, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';

// KGIS API 端点配置
export const KGIS_API_ENDPOINT = process.env.KGIS_API_ENDPOINT || 'http://localhost:8000';

interface ConfigType {
  headers?: { [key: string]: string };
  hold?: boolean;
  timeout?: number;
}

interface ResponseDataType {
  code?: number;
  message?: string;
  data?: any;
}

/**
 * 请求开始拦截器
 */
function requestStart(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  return config;
}

/**
 * 请求成功响应拦截器
 */
function responseSuccess(response: AxiosResponse<ResponseDataType>) {
  return response;
}

/**
 * 响应数据检查
 */
function checkRes(data: ResponseDataType) {
  if (data === undefined) {
    console.log('KGIS API error->', data, 'data is empty');
    return Promise.reject('KGIS服务器异常');
  } else if (data?.code && (data.code < 200 || data.code >= 400)) {
    return Promise.reject(data);
  }
  return data;
}

/**
 * 响应错误处理
 */
function responseError(err: any) {
  if (!err) {
    return Promise.reject({ message: 'KGIS服务未知错误' });
  }
  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }

  if (err?.response?.data) {
    return Promise.reject(err?.response?.data);
  }
  return Promise.reject(err);
}

/* 创建 KGIS 请求实例 */
const instance = axios.create({
  timeout: 60 * 60 * 1000, // 一小时超时时间
  headers: {
    'content-type': 'application/json',
    'Cache-Control': 'no-cache'
  }
});

/* 请求拦截 */
instance.interceptors.request.use(requestStart, (err) => Promise.reject(err));
/* 响应拦截 */
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

export function kgisRequest(
  url: string,
  data: any,
  config: ConfigType = {},
  method: Method = 'POST'
): any {
  /* 去除空值参数 */
  for (const key in data) {
    if (data[key] === null || data[key] === undefined || data[key] === '') {
      delete data[key];
    }
  }

  return instance
    .request({
      baseURL: KGIS_API_ENDPOINT,
      url,
      method,
      data: ['POST', 'PUT', 'DELETE'].includes(method) ? data : undefined,
      params: !['POST', 'PUT', 'DELETE'].includes(method) ? data : undefined,
      ...config // 自定义配置
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err));
}

/**
 * KGIS API POST 请求
 */
export function kgisPOST<T = any>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return kgisRequest(url, data, config, 'POST');
}

/**
 * KGIS API GET 请求
 */
export function kgisGET<T = any>(url: string, params = {}, config: ConfigType = {}): Promise<T> {
  return kgisRequest(url, params, config, 'GET');
}

/**
 * KGIS API PUT 请求
 */
export function kgisPUT<T = any>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return kgisRequest(url, data, config, 'PUT');
}

/**
 * KGIS API DELETE 请求
 */
export function kgisDELETE<T = any>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return kgisRequest(url, data, config, 'DELETE');
}
