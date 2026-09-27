 const fileInput = document.getElementById('audio-upload');
        const playerScreen = document.getElementById('player-screen');
        const titleEl = document.getElementById('track-title');
        const artistEl = document.getElementById('track-artist');
        const counterEl = document.getElementById('playlist-counter');
        const lyricsPanel = document.getElementById('lyrics-panel');
        const lyricsContainer = document.getElementById('lyrics-container');
        const lyricsCloseBtn = document.getElementById('lyrics-close');
        const lyricsTitleEl = document.getElementById('lyrics-title');
        const lyricsArtistEl = document.getElementById('lyrics-artist');
        const lyricsArtEl = document.getElementById('lyrics-art');
        const libraryPanel = document.getElementById('library-panel');
        const libContent = document.getElementById('lib-content');
        const coverflowPanel = document.getElementById('coverflow-panel');
        
        let audio = new Audio();
        let isPlaying = false;
        
        let rawFiles = [];
        let lrcMap = new Map();
        let globalLibrary = [];
        let albumDictionary = {}; 
        let coverFlowArray = []; 
        let cfIndex = 0;
        
        let activePlaylist = [];
        let unshuffledPlaylist = [];
        let currentIndex = 0;
        let isShuffle = false;

        let currentLyrics = [];
        let currentLyricIndex = -1;
        let pageBackAction = null;
        let lyricsArtUrl = '';

        const jsmediatags = window.jsmediatags;

        function formatDuration(seconds) {
            if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
            const totalSeconds = Math.floor(seconds);
            const minutes = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            return `${minutes}:${String(secs).padStart(2, '0')}`;
        }

        function splitMetadataValues(value, fallback) {
            const unwrap = item => {
                if (Array.isArray(item)) return item.flatMap(unwrap);
                if (!item || typeof item !== 'object') return [item];
                if ('data' in item) return unwrap(item.data);
                if ('text' in item) return unwrap(item.text);
                if ('value' in item) return unwrap(item.value);
                return [];
            };

            const values = unwrap(value)
                .flatMap(item => String(item || '').split(';'))
                .map(item => item.trim())
                .filter(item => item && !['undefined', 'null'].includes(item.toLowerCase()));
            return [...new Set(values.length ? values : [fallback])];
        }

        function formatMetadataValue(value, fallback) {
            return splitMetadataValues(value, fallback).join('; ');
        }

        function getMetadataValue(tags, names) {
            const normalizedNames = names.map(name => name.toLowerCase().replace(/[\s_-]/g, ''));
            const matchingKey = Object.keys(tags).find(key => normalizedNames.includes(key.toLowerCase().replace(/[\s_-]/g, '')));
            return matchingKey ? tags[matchingKey] : undefined;
        }

        function saveTrackDuration(track, seconds) {
            if (!Number.isFinite(seconds) || seconds <= 0) return;
            track.duration = seconds;
            const row = document.querySelector(`[data-track-file="${CSS.escape(track.file.name)}"]`);
            if (row) {
                const durationEl = row.querySelector('.lib-item-count');
                if (durationEl) durationEl.innerText = formatDuration(seconds);
            }
        }

        function getTrackDuration(file) {
            return new Promise(resolve => {
                const url = URL.createObjectURL(file);
                const probe = new Audio();
                let settled = false;
                let timeoutId = 0;

                const finish = seconds => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    probe.removeAttribute('src');
                    probe.load();
                    URL.revokeObjectURL(url);
                    resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
                };

                const readDuration = () => {
                    if (Number.isFinite(probe.duration) && probe.duration > 0) {
                        finish(probe.duration);
                    }
                };

                probe.preload = 'metadata';
                probe.addEventListener('loadedmetadata', readDuration);
                probe.addEventListener('durationchange', readDuration);
                probe.addEventListener('loadeddata', readDuration);
                probe.addEventListener('canplay', readDuration);
                probe.addEventListener('error', () => finish(0), { once: true });
                probe.src = url;
                probe.load();

                timeoutId = setTimeout(() => finish(0), 10000);
            });
        }

        function parseLrcText(rawText) {
            if (!rawText || typeof rawText !== 'string') return [];

            const lines = rawText.split(/\r?\n/);
            const parsed = [];

            lines.forEach(line => {
                const match = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/);
                if (!match) return;

                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const milliseconds = (match[3] || '0').padEnd(3, '0').slice(0, 3);
                const timeInSeconds = minutes * 60 + seconds + (Number(`0.${milliseconds}`) || 0);
                const text = (match[4] || '').trim();

                if (text) {
                    parsed.push({ time: timeInSeconds, text });
                }
            });

            return parsed.sort((a, b) => a.time - b.time);
        }

        function normalizeEmbeddedLyrics(rawLyrics) {
            if (!rawLyrics) return [];
            const lyricText = typeof rawLyrics === 'string' ? rawLyrics : rawLyrics.text || rawLyrics.data || '';
            if (!lyricText) return [];

            if (lyricText.toString().match(/\[\d{1,2}:\d{2}/)) {
                return parseLrcText(lyricText.toString());
            }

            return lyricText.toString().split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => ({ time: 0, text: line }));
        }

        function showNoLyrics() {
            currentLyrics = [];
            currentLyricIndex = -1;
            lyricsContainer.innerHTML = '<div class="lyric-line">No lyrics available for this track.</div>';
        }

        function renderLyrics() {
            if (!currentLyrics.length) {
                showNoLyrics();
                return;
            }

            lyricsContainer.innerHTML = '';
            currentLyrics.forEach((lyric, index) => {
                const line = document.createElement('div');
                line.className = 'lyric-line';
                if (index === currentLyricIndex) line.classList.add('active');
                line.textContent = lyric.text;
                lyricsContainer.appendChild(line);
            });

            const lyricLines = lyricsContainer.querySelectorAll('.lyric-line');
            if (lyricLines.length > 0 && currentLyricIndex >= 0) {
                const activeLine = lyricLines[currentLyricIndex];
                if (activeLine) {
                    const offset = activeLine.offsetTop - (lyricsContainer.clientHeight / 2) + (activeLine.offsetHeight / 2);
                    lyricsContainer.scrollTop = Math.max(offset, 0);
                }
            }
        }

        function updateLyricsFromTime() {
            if (!currentLyrics.length || audio.duration === Infinity || Number.isNaN(audio.duration)) return;

            let activeIndex = -1;
            for (let i = 0; i < currentLyrics.length; i++) {
                if (audio.currentTime >= currentLyrics[i].time) {
                    activeIndex = i;
                } else {
                    break;
                }
            }

            if (activeIndex !== currentLyricIndex) {
                currentLyricIndex = activeIndex;
                renderLyrics();
            }
        }

        function loadLyricsForTrack(track) {
            currentLyrics = [];
            currentLyricIndex = -1;
            lyricsContainer.innerHTML = '<div class="lyric-line">Loading lyrics…</div>';

            const cleanName = (track.file.name || '').replace(/\.[^.]+$/, '');
            const matchingLrc = lrcMap.get(cleanName) || lrcMap.get(track.title);

            if (matchingLrc) {
                const reader = new FileReader();
                reader.onload = () => {
                    currentLyrics = parseLrcText(String(reader.result));
                    if (!currentLyrics.length) {
                        showNoLyrics();
                        return;
                    }
                    currentLyricIndex = 0;
                    renderLyrics();
                };
                reader.onerror = () => showNoLyrics();
                reader.readAsText(matchingLrc, 'utf-8');
                return;
            }

            jsmediatags.read(track.file, {
                onSuccess: function(tag) {
                    const lyricSource = tag.tags.lyrics || tag.tags.unsynchronisedLyrics || tag.tags.Lyrics || tag.tags.lyric || tag.tags['TXXX:Lyrics'];
                    const embedded = normalizeEmbeddedLyrics(lyricSource);
                    if (embedded.length > 0) {
                        currentLyrics = embedded;
                        currentLyricIndex = 0;
                        renderLyrics();
                    } else {
                        showNoLyrics();
                    }
                },
                onError: function() {
                    showNoLyrics();
                }
            });
        }

        function updateLyricsHeader(track) {
            if (track.title.length > 25) {
                lyricsTitleEl.innerHTML = `<marquee scrollamount="4">${track.title}</marquee>`;
            } else {
                lyricsTitleEl.textContent = track.title;
            }
            lyricsArtistEl.textContent = track.albumArtist || track.artist || 'Unknown Album Artist';
        }

        // --- 1. Scanning & Library ---
        fileInput.addEventListener('change', async function(e) {
            document.getElementById('file-container').style.display = 'none';
            const files = Array.from(e.target.files);
            
            rawFiles = files.filter(file => {
                if (file.name.match(/\.lrc$/i)) {
                    lrcMap.set(file.name.substring(0, file.name.lastIndexOf('.')), file);
                    return false; 
                }
                return file.name.match(/\.(flac|opus|ogg|mp3|wav|m4a)$/i) || file.type.startsWith('audio/');
            });

            if (rawFiles.length === 0) return;
            titleEl.innerText = "Scanning Library...";
            
            for (let i = 0; i < rawFiles.length; i++) {
                artistEl.innerText = `${i + 1} / ${rawFiles.length}`;
                const durationPromise = getTrackDuration(rawFiles[i]);
                await new Promise(resolve => {
                    let settled = false;
                    const finish = () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(metadataTimeout);
                        resolve();
                    };
                    const metadataTimeout = setTimeout(finish, 10000);

                    const file = rawFiles[i];
                    try {
                        jsmediatags.read(file, {
                        onSuccess: function(tag) {
                            const trackData = {
                                file: file,
                                title: tag.tags.title || file.name.split('.')[0],
                                artist: formatMetadataValue(getMetadataValue(tag.tags, ['artist', 'TPE1']), 'Unknown Artist'),
                                artistValues: splitMetadataValues(getMetadataValue(tag.tags, ['artist', 'TPE1']), 'Unknown Artist'),
                                album: tag.tags.album || 'Unknown Album',
                                albumArtist: formatMetadataValue(getMetadataValue(tag.tags, ['albumartist', 'album artist', 'album_artist', 'aART', 'TPE2']), 'Unknown Album Artist'),
                                albumArtistValues: splitMetadataValues(getMetadataValue(tag.tags, ['albumartist', 'album artist', 'album_artist', 'aART', 'TPE2']), 'Unknown Album Artist'),
                                genre: formatMetadataValue(getMetadataValue(tag.tags, ['genre', 'TCON']), 'Unknown Genre'),
                                genreValues: splitMetadataValues(getMetadataValue(tag.tags, ['genre', 'TCON']), 'Unknown Genre'),
                                style: formatMetadataValue(getMetadataValue(tag.tags, ['style']), 'Unknown Style'),
                                styleValues: splitMetadataValues(getMetadataValue(tag.tags, ['style']), 'Unknown Style'),
                                releaseType: formatMetadataValue(getMetadataValue(tag.tags, ['releasetype', 'release type', 'release_type', 'custom3']), 'Unknown Release Type'),
                                releaseTypeValues: splitMetadataValues(getMetadataValue(tag.tags, ['releasetype', 'release type', 'release_type', 'custom3']), 'Unknown Release Type'),
                                duration: 0
                            };
                            globalLibrary.push(trackData);
                            durationPromise.then(duration => saveTrackDuration(trackData, duration));

                            if (!albumDictionary[trackData.album]) {
                                let coverUrl = '';
                                if (tag.tags.picture) {
                                    const blob = new Blob([new Uint8Array(tag.tags.picture.data)], { type: tag.tags.picture.format });
                                    coverUrl = URL.createObjectURL(blob);
                                }
                                albumDictionary[trackData.album] = {
                                    title: trackData.album,
                                    artist: trackData.albumArtist || trackData.artist,
                                    coverUrl: coverUrl,
                                    tracks: []
                                };
                            }
                            albumDictionary[trackData.album].tracks.push(trackData);
                            finish();
                        },
                        onError: function() {
                            const trackData = {
                                file: file, title: file.name.split('.')[0],
                                artist: 'Unknown Artist', artistValues: ['Unknown Artist'],
                                album: 'Unknown Album', albumArtist: 'Unknown Album Artist', albumArtistValues: ['Unknown Album Artist'],
                                genre: 'Unknown Genre', genreValues: ['Unknown Genre'],
                                style: 'Unknown Style', styleValues: ['Unknown Style'],
                                releaseType: 'Unknown Release Type', releaseTypeValues: ['Unknown Release Type'], duration: 0
                            };
                            globalLibrary.push(trackData);
                            durationPromise.then(duration => saveTrackDuration(trackData, duration));
                            finish();
                        }
                        });
                    } catch (error) {
                        finish();
                    }
                });
            }
            
            globalLibrary.sort((a, b) => a.title.localeCompare(b.title));
            coverFlowArray = Object.values(albumDictionary).sort((a, b) => a.title.localeCompare(b.title));
            initCoverFlow();

            playSubset(globalLibrary, "All Tracks");
            buildLibraryRoot();
        });

        // --- 2. Cover Flow Engine ---
        function initCoverFlow() {
            const scrubber = document.getElementById('cf-scrubber');
            const stage = document.getElementById('cf-stage');
            scrubber.innerHTML = '';
            stage.innerHTML = '';
            stage.style.height = '240px';
            stage.style.minHeight = '240px';
            stage.style.display = 'block';

            const letters = ['123', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
            letters.forEach(char => {
                const span = document.createElement('span');
                span.className = 'cf-letter';
                span.innerText = char;
                span.onclick = () => jumpToLetter(char);
                scrubber.appendChild(span);
            });

            coverFlowArray.forEach((album, index) => {
                const div = document.createElement('div');
                div.className = 'cf-album';
                div.style.cssText = `
                    position: absolute !important;
                    left: 50% !important;
                    top: 50% !important;
                    width: 160px !important;
                    height: 160px !important;
                    margin-left: -80px !important;
                    margin-top: -80px !important;
                    border-radius: 14px !important;
                    background-size: cover !important;
                    background-position: center !important;
                    background-color: #2a2a2a !important;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.45) !important;
                    border: 2px solid rgba(255,255,255,0.08) !important;
                    transition: transform 0.25s ease, opacity 0.25s ease, z-index 0.25s ease;
                `;
                if (album.coverUrl) div.style.backgroundImage = `url(${album.coverUrl})`;
                div.onclick = () => {
                    if (index === cfIndex) {
                        coverflowPanel.classList.remove('visible');
                        buildAlbumTrackList(album);
                    } else {
                        cfIndex = index;
                        updateCoverFlow();
                    }
                };
                stage.appendChild(div);
            });
            updateCoverFlow();
        }

        function updateCoverFlow() {
            if (coverFlowArray.length === 0) return;
            const covers = document.querySelectorAll('.cf-album');
            const cfTitleEl = document.getElementById('cf-album-title');
            const cfArtistEl = document.getElementById('cf-album-artist');

            const currentTitle = coverFlowArray[cfIndex].title;
            if (currentTitle.length > 25) {
                cfTitleEl.innerHTML = `<marquee scrollamount="4">${currentTitle}</marquee>`;
            } else {
                cfTitleEl.innerText = currentTitle;
            }
            
            cfArtistEl.innerText = coverFlowArray[cfIndex].artist;

            covers.forEach((cover, i) => {
                cover.style.setProperty('width', '160px', 'important');
                cover.style.setProperty('height', '160px', 'important');
                cover.style.setProperty('display', 'block', 'important');
                cover.style.setProperty('margin-left', '-80px', 'important');
                cover.style.setProperty('margin-top', '-80px', 'important');
                cover.style.setProperty('position', 'absolute', 'important');
                cover.style.setProperty('left', '50%', 'important');
                cover.style.setProperty('top', '50%', 'important');

                const diff = i - cfIndex;
                if (diff === 0) {
                    cover.style.transform = `translateX(0px) scale(1)`;
                    cover.style.zIndex = 10;
                    cover.style.opacity = 1;
                    cover.style.pointerEvents = 'auto';
                } else if (diff === -1) {
                    cover.style.transform = `translateX(-110px) scale(0.85) perspective(400px) rotateY(25deg)`;
                    cover.style.zIndex = 9;
                    cover.style.opacity = 0.6;
                    cover.style.pointerEvents = 'auto';
                } else if (diff === 1) {
                    cover.style.transform = `translateX(110px) scale(0.85) perspective(400px) rotateY(-25deg)`;
                    cover.style.zIndex = 9;
                    cover.style.opacity = 0.6;
                    cover.style.pointerEvents = 'auto';
                } else if (diff < -1) {
                    cover.style.transform = `translateX(-200px) scale(0.6)`;
                    cover.style.zIndex = 5;
                    cover.style.opacity = 0;
                    cover.style.pointerEvents = 'none';
                } else if (diff > 1) {
                    cover.style.transform = `translateX(200px) scale(0.6)`;
                    cover.style.zIndex = 5;
                    cover.style.opacity = 0;
                    cover.style.pointerEvents = 'none';
                }
            });
        }

        function jumpToLetter(char) {
            let targetIndex = 0;
            if (char === '123') targetIndex = coverFlowArray.findIndex(a => /^[0-9]/.test(a.title));
            else targetIndex = coverFlowArray.findIndex(a => a.title.toUpperCase().startsWith(char));
            if (targetIndex !== -1) { cfIndex = targetIndex; updateCoverFlow(); }
        }

        let cfStartX = 0, cfIsDragging = false;
        const stage = document.getElementById('cf-stage');
        stage.addEventListener('pointerdown', e => { cfStartX = e.clientX; cfIsDragging = true; });
        stage.addEventListener('pointerup', e => {
            if (!cfIsDragging) return;
            cfIsDragging = false;
            const diffX = cfStartX - e.clientX;
            if (Math.abs(diffX) > 40) {
                if (diffX > 0 && cfIndex < coverFlowArray.length - 1) cfIndex++; 
                else if (diffX < 0 && cfIndex > 0) cfIndex--; 
                updateCoverFlow();
            }
        });
        stage.addEventListener('pointerleave', () => { cfIsDragging = false; });
        document.getElementById('cf-close').onclick = () => coverflowPanel.classList.remove('visible');

        // --- 3. Standard Library UI ---
        function playSubset(trackArray, contextName) {
            unshuffledPlaylist = trackArray;
            if (isShuffle) activePlaylist = [...unshuffledPlaylist].sort(() => Math.random() - 0.5);
            else activePlaylist = [...unshuffledPlaylist];
            currentIndex = 0;
            counterEl.style.display = 'block';
            libraryPanel.classList.remove('visible');
            showToast(`Playing: ${contextName}`);
            loadTrack(currentIndex);
        }

        lyricsCloseBtn.onclick = (e) => {
            e.stopPropagation();
            lyricsPanel.classList.remove('visible');
        };

        function buildLibraryRoot() {
            pageBackAction = null;
            document.getElementById('lib-title').innerText = "Library";
            libContent.innerHTML = '';

            const categories = [
                { name: "All Tracks", key: 'all' },
                { name: "Albums", key: 'coverflow' },
                { name: "Artists", key: 'artistValues' },
                { name: "Album Artists", key: 'albumArtistValues' },
                { name: "Genres", key: 'genreValues' },
                { name: "Styles", key: 'styleValues' },
                { name: "Release Types", key: 'releaseTypeValues' }
            ];

            categories.sort((a, b) => a.name.localeCompare(b.name)).forEach(cat => {
                const div = document.createElement('div');
                div.className = 'lib-item';
                div.innerHTML = `${cat.name} <span class="lib-item-count">></span>`;
                div.onclick = (e) => {
                    e.stopPropagation();
                    if (cat.key === 'all') buildLibraryCategory('all', "All Tracks");
                    else if (cat.key === 'coverflow') {
                        libraryPanel.classList.remove('visible');
                        coverflowPanel.classList.add('visible');
                        pageBackAction = () => {
                            coverflowPanel.classList.remove('visible');
                            buildLibraryRoot();
                            libraryPanel.classList.add('visible');
                        };
                    }
                    else buildLibraryCategory(cat.key, cat.name);
                };
                libContent.appendChild(div);
            });
        }

        function buildAlbumTrackList(album) {
            buildTrackList(album.title, album.tracks, () => {
                libraryPanel.classList.remove('visible');
                coverflowPanel.classList.add('visible');
            });
        }

        function buildTrackList(title, tracks, onBack) {
            pageBackAction = onBack;
            document.getElementById('lib-title').innerText = title;
            libContent.innerHTML = '';

            tracks.forEach((track, index) => {
                const div = document.createElement('div');
                div.className = 'lib-item track-row';
                div.dataset.trackFile = track.file.name;
                div.innerHTML = `<span class="lib-item-number">${index + 1}</span><span class="track-list-title">${track.title}</span><span class="lib-item-count">${formatDuration(track.duration || 0)}</span>`;
                if (!track.duration) {
                    getTrackDuration(track.file).then(duration => saveTrackDuration(track, duration));
                }
                div.onclick = (e) => {
                    e.stopPropagation();
                    unshuffledPlaylist = tracks;
                    activePlaylist = [...tracks];
                    currentIndex = index;
                    counterEl.style.display = 'block';
                    libraryPanel.classList.remove('visible');
                    showToast(`Playing: ${track.title}`);
                    loadTrack(currentIndex);
                };
                libContent.appendChild(div);
            });

            libraryPanel.classList.add('visible');
        }

        function buildAlbumList(title, tracks, onBack) {
            pageBackAction = onBack;
            document.getElementById('lib-title').innerText = title;
            libContent.innerHTML = '';

            const albums = {};
            tracks.forEach(track => {
                const album = track.album || 'Unknown Album';
                if (!albums[album]) albums[album] = [];
                albums[album].push(track);
            });

            Object.keys(albums).sort().forEach(album => {
                const div = document.createElement('div');
                div.className = 'lib-item';
                const albumArt = albumDictionary[album]?.coverUrl;
                const albumTitle = album.length > 25 ? `<marquee scrollamount="4">${album}</marquee>` : album;
                div.innerHTML = `${albumArt ? `<img class="album-list-art" src="${albumArt}" alt="">` : '<span class="album-list-art album-list-art-empty"></span>'}<span class="album-list-title">${albumTitle}</span><span class="lib-item-count">${albums[album].length}</span>`;
                div.onclick = e => {
                    e.stopPropagation();
                    buildTrackList(album, albums[album], () => buildAlbumList(title, tracks, onBack));
                };
                libContent.appendChild(div);
            });

            libraryPanel.classList.add('visible');
        }

        function buildLibraryCategory(key, title) {
            pageBackAction = buildLibraryRoot;
            document.getElementById('lib-title').innerText = title;
            libContent.innerHTML = '';

            if (key === 'all') {
                globalLibrary.forEach((track, index) => {
                    const div = document.createElement('div');
                    div.className = 'lib-item track-row';
                    div.dataset.trackFile = track.file.name;
                    div.innerHTML = `<span class="lib-item-number">${index + 1}</span><span class="track-list-title">${track.title}</span><span class="lib-item-count">${formatDuration(track.duration || 0)}</span>`;
                    if (!track.duration) {
                        getTrackDuration(track.file).then(duration => saveTrackDuration(track, duration));
                    }
                    div.onclick = (e) => {
                        e.stopPropagation();
                        unshuffledPlaylist = globalLibrary;
                        activePlaylist = [...globalLibrary];
                        currentIndex = index;
                        counterEl.style.display = 'block';
                        libraryPanel.classList.remove('visible');
                        showToast(`Playing: ${track.title}`);
                        loadTrack(currentIndex);
                    };
                    libContent.appendChild(div);
                });
                return;
            }

            const grouped = {};
            globalLibrary.forEach(track => {
                const values = Array.isArray(track[key]) ? track[key] : [track[key]];
                values.forEach(value => {
                    if (!grouped[value]) grouped[value] = [];
                    grouped[value].push(track);
                });
            });

            Object.keys(grouped).sort().forEach(k => {
                const div = document.createElement('div');
                div.className = 'lib-item';
                div.innerHTML = `${k} <span class="lib-item-count">${grouped[k].length}</span>`;
                div.onclick = (e) => {
                    e.stopPropagation();
                    if (['artistValues', 'albumArtistValues', 'genreValues'].includes(key)) {
                        buildAlbumList(k, grouped[k], () => buildLibraryCategory(key, title));
                    } else if (['genreValues', 'styleValues', 'releaseTypeValues'].includes(key)) {
                        buildTrackList(k, grouped[k], () => buildLibraryCategory(key, title));
                    } else {
                        playSubset(grouped[k], k);
                    }
                };
                libContent.appendChild(div);
            });
        }

        document.getElementById('lib-close').onclick = (e) => {
            e.stopPropagation();
            libraryPanel.classList.remove('visible');
        };

        function addSwipeBack(panel, shouldIgnoreStart) {
            let startX = 0;
            let startY = 0;
            let tracking = false;

            panel.addEventListener('pointerdown', e => {
                if (shouldIgnoreStart(e)) return;
                startX = e.clientX;
                startY = e.clientY;
                tracking = true;
            });

            panel.addEventListener('pointerup', e => {
                if (!tracking) return;
                tracking = false;
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) && pageBackAction) {
                    pageBackAction();
                }
            });

            panel.addEventListener('pointerleave', () => { tracking = false; });
        }

        addSwipeBack(libraryPanel, () => false);
        addSwipeBack(coverflowPanel, e => Boolean(e.target.closest('#cf-stage')));

        // --- 4. Main Playback & Gestures ---
        function loadTrack(index) {
            if (index < 0 || index >= activePlaylist.length) return;
            const trackObj = activePlaylist[index];
            const file = trackObj.file;
            
            audio.pause();
            audio.onloadedmetadata = () => saveTrackDuration(trackObj, audio.duration);
            audio.ondurationchange = () => saveTrackDuration(trackObj, audio.duration);
            audio.src = URL.createObjectURL(file);
            counterEl.innerText = `${index + 1} / ${activePlaylist.length}`;
            titleEl.innerText = trackObj.title;
            artistEl.innerText = trackObj.artist;
            updateLyricsHeader(trackObj);
            
            jsmediatags.read(file, {
                onSuccess: function(tag) {
                    if (tag.tags.picture) {
                        const blob = new Blob([new Uint8Array(tag.tags.picture.data)], { type: tag.tags.picture.format });
                        const imgUrl = URL.createObjectURL(blob);
                        playerScreen.style.backgroundImage = `url(${imgUrl})`;
                        if (lyricsArtUrl) URL.revokeObjectURL(lyricsArtUrl);
                        lyricsArtUrl = imgUrl;
                        lyricsArtEl.src = imgUrl;
                        lyricsArtEl.hidden = false;
                    } else {
                        playerScreen.style.backgroundImage = 'none';
                        lyricsArtEl.hidden = true;
                    }
                },
                onError: function() {
                    lyricsArtEl.hidden = true;
                }
            });

            loadLyricsForTrack(trackObj);
            audio.play();
            isPlaying = true;
        }

        function togglePlay() {
            if (activePlaylist.length === 0) return;
            if (isPlaying) audio.pause();
            else audio.play();
            isPlaying = !isPlaying;
        }

        audio.addEventListener('timeupdate', updateLyricsFromTime);

        audio.addEventListener('ended', () => {
            if (activePlaylist.length > 0) {
                currentIndex = (currentIndex + 1) % activePlaylist.length;
                loadTrack(currentIndex);
            }
        });

        function showToast(msg) {
            document.getElementById('toast').innerText = msg;
            document.getElementById('toast').style.opacity = 1;
            setTimeout(() => document.getElementById('toast').style.opacity = 0, 1500);
        }

        let mainStartX = 0, mainStartY = 0;
        let mainIsDragging = false;

        playerScreen.addEventListener('pointerdown', function(e) {
            if (e.target.closest('.panel') || e.target === fileInput || activePlaylist.length === 0) return;
            mainStartX = e.clientX;
            mainStartY = e.clientY;
            mainIsDragging = true;
        });

        playerScreen.addEventListener('pointerup', function(e) {
            if (!mainIsDragging) return;
            mainIsDragging = false;
            
            const diffX = mainStartX - e.clientX;
            const diffY = mainStartY - e.clientY;

            if (Math.abs(diffX) > 50 || Math.abs(diffY) > 50) {
                if (Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX > 0) { currentIndex = (currentIndex + 1) % activePlaylist.length; loadTrack(currentIndex); }
                    else { currentIndex = (currentIndex - 1 + activePlaylist.length) % activePlaylist.length; loadTrack(currentIndex); }
                } else {
                    if (diffY > 0) lyricsPanel.classList.add('visible'); 
                    else libraryPanel.classList.add('visible');
                }
            } else {
                togglePlay();
            }
        });
        playerScreen.addEventListener('pointerleave', () => mainIsDragging = false);
      