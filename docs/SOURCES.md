# Источники видео

Каталог и воспроизведение разделены. Каталог знает про все фильмы на свете;
источник знает, откуда взять байты конкретного файла. Источники подключаются
как плагины.

Из коробки есть один — `local`: ваши собственные файлы.

## Интерфейс

Провайдер — обычный объект. Обязательны `id`, `name` и два метода:

```js
export class MySource {
  id = 'my-source';           // уникальный, url-safe
  name = 'Моё хранилище';
  supportsDownload = true;

  /** Что можно посмотреть у этого титула. Пустой массив — ничего нет. */
  async getSources(titleId, { season, episode } = {}) {
    return [/* Source[] */];
  }

  /** Отдать байты. Обязана поддерживать Range, иначе перемотки не будет. */
  async openStream(sourceId, { range } = {}) {
    return { stream, start, end, size, totalSize, mimeType, filename, partial };
  }

  /** Необязательно: показать свой каталог на главной и в «Моей библиотеке». */
  async listTitles() {
    return [/* Card[] */];
  }

  /** Необязательно: переиндексация по расписанию. */
  async refresh() {}
}
```

Регистрация — в `server/src/index.js`:

```js
import { sources } from './sources/registry.js';
import { MySource } from './sources/my-source.js';

sources.register(new MySource());
```

Всё. Каталог, страница фильма и плеер подхватят источник сами; если у титула
есть несколько источников, они отсортируются по `score` и покажутся списком.

### Source

```js
{
  id: 'abc123',                    // уникален внутри провайдера
  providerId: 'my-source',
  titleId: 'movie:603',            // как в каталоге: movie:<tmdbId> / tv:<tmdbId>
  label: '4K · HDR · Remux',       // что видит человек
  filename: 'movie.mkv',
  container: 'mkv',
  size: 32000000000,               // байт
  duration: 8880,                  // секунд, можно null
  quality: { resolution: '4K', height: 2160, hdr: 'HDR', videoCodec: 'hevc', bitrate: 45000000 },
  audioTracks: [{ index: 0, language: 'ru', label: 'Русская · 5.1 · DTS', default: true }],
  hasRussianAudio: true,
  subtitles: [{ index: 0, language: 'ru', label: 'Русские', external: true, url: '/api/...' }],
  season: null, episode: null,     // для сериалов
  compatibility: 'most',           // universal | most | tv-only | limited
  playUrl: '/api/playback/stream/my-source/abc123',
  downloadUrl: '/api/playback/download/my-source/abc123',
  score: 22600,                    // выше — лучше, для сортировки
}
```

`titleId` — это то, как связываются каталог и файл. Если у вас есть IMDB ID,
переведите его в идентификатор каталога через `findByExternalId()` из
`server/src/metadata/tmdb.js`.

### openStream

Возвращаемый объект пробрасывается в HTTP-ответ:

| поле | зачем |
|---|---|
| `stream` | любой Readable |
| `start`, `end` | границы отданного диапазона, включительно |
| `size` | сколько байт в этом ответе |
| `totalSize` | размер всего файла |
| `partial` | `true` → 206 и `Content-Range`; `false` → 200 |
| `mimeType`, `filename` | заголовки и имя при скачивании |
| `unsatisfiable` | `true` → 416, если диапазон за пределами файла |

Range обязателен. Без него телевизор при каждой перемотке начинает качать файл
с нуля — со стороны это выглядит как зависший плеер.

## Что подключать можно

Провайдер должен отдавать то, на что у вас есть право:

- файлы на вашем диске, NAS или в вашем облаке — `local` уже это делает;
- сервис, с которым у вас есть договор или платный API-ключ, в рамках его
  условий;
- собственные съёмки, публичное достояние, материалы под свободными лицензиями.

Пиратские балансеры (Kodik, Videocdn, Alloha, Collaps и подобные) сюда не
подключаются — они раздают чужой контент без прав, и адаптера к ним в проекте
нет и не будет. Для всего, чего нет у вас на полке, каталог показывает
лицензионный сервис с правами в вашей стране; это встроено и работает из
коробки.

## Пример: HTTP-хранилище

Скелет провайдера, который берёт файлы с вашего же веб-сервера и корректно
пробрасывает Range:

```js
import { Readable } from 'node:stream';

export class HttpStorage {
  id = 'http';
  name = 'Мой сервер';
  supportsDownload = true;

  constructor(baseUrl, index) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.index = index;              // titleId -> { path, size, ... }
  }

  async getSources(titleId) {
    const entry = this.index[titleId];
    if (!entry) return [];
    return [{
      id: encodeURIComponent(entry.path),
      providerId: this.id,
      titleId,
      label: entry.label,
      filename: entry.path.split('/').pop(),
      container: entry.path.split('.').pop(),
      size: entry.size,
      duration: entry.duration ?? null,
      quality: entry.quality ?? {},
      audioTracks: entry.audioTracks ?? [],
      hasRussianAudio: (entry.audioTracks ?? []).some((t) => t.language === 'ru'),
      subtitles: [],
      season: null, episode: null,
      compatibility: 'most',
      playUrl: `/api/playback/stream/${this.id}/${encodeURIComponent(entry.path)}`,
      downloadUrl: `/api/playback/download/${this.id}/${encodeURIComponent(entry.path)}`,
      score: entry.quality?.height ?? 0,
    }];
  }

  async openStream(sourceId, { range } = {}) {
    const path = decodeURIComponent(sourceId);
    const response = await fetch(`${this.baseUrl}/${path}`, {
      headers: range ? { Range: range } : {},
    });
    if (!response.ok && response.status !== 206) return null;

    const contentRange = response.headers.get('content-range');
    const match = contentRange && /bytes (\d+)-(\d+)\/(\d+)/.exec(contentRange);
    const totalSize = match ? Number(match[3]) : Number(response.headers.get('content-length'));

    return {
      stream: Readable.fromWeb(response.body),
      start: match ? Number(match[1]) : 0,
      end: match ? Number(match[2]) : totalSize - 1,
      size: Number(response.headers.get('content-length')),
      totalSize,
      partial: response.status === 206,
      mimeType: response.headers.get('content-type') || 'video/mp4',
      filename: path.split('/').pop(),
    };
  }
}
```

Заметьте: `Range` от клиента пробрасывается на исходный сервер, а его
`Content-Range` разбирается обратно. Так перемотка остаётся мгновенной и
трафик не гоняется зря.
