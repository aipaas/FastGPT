export enum FileIconType {
  PDF = 'file/fill/pdf',
  PPT = 'file/fill/ppt',
  XLSX = 'file/fill/xlsx',
  CSV = 'file/fill/csv',
  DOC = 'file/fill/doc',
  TXT = 'file/fill/txt',
  MARKDOWN = 'file/fill/markdown',
  HTML = 'file/fill/html',
  IMAGE = 'image',
  FILE = 'file/fill/file'
}

export const fileImgs = [
  { suffix: 'pdf', src: FileIconType.PDF },
  { suffix: 'ppt', src: FileIconType.PPT },
  { suffix: 'xlsx', src: FileIconType.XLSX },
  { suffix: 'csv', src: FileIconType.CSV },
  { suffix: '(doc|docs)', src: FileIconType.DOC },
  { suffix: 'txt', src: FileIconType.TXT },
  { suffix: 'md', src: FileIconType.MARKDOWN },
  { suffix: 'html', src: FileIconType.HTML },
  { suffix: '(jpg|jpeg|png|gif|bmp|webp|svg|ico|tiff|tif)', src: FileIconType.IMAGE }

  // { suffix: '.', src: '/imgs/files/file.svg' }
];

export function getFileIcon(name = '', defaultImg: FileIconType = FileIconType.FILE): FileIconType {
  return (
    fileImgs.find((item) => new RegExp(`\.${item.suffix}`, 'gi').test(name))?.src || defaultImg
  );
}
