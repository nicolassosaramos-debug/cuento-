// Configuración del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const pageIndicator = document.getElementById('page-indicator');
const screenReaderText = document.getElementById('screen-reader-text');

const btnPrev = document.getElementById('btn-prev-page');
const btnNext = document.getElementById('btn-next-page');
const btnReadAloud = document.getElementById('btn-read-aloud');
const btnStopRead = document.getElementById('btn-stop-read');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');

let pageFlip = null;
let extractedTextByPage = []; // Guarda el texto extraído de cada página para la lectura en voz alta
let zoomLevel = 1.0;
const synth = window.speechSynthesis;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadRepoPDF();
    setupEventListeners();
});

// 1 y 2. Cargar 'cuento.pdf' directamente desde el repositorio
async function loadRepoPDF() {
    try {
        loading.style.display = 'block';
        
        // Solicita el cuento ubicado en la raíz del repositorio
        const response = await fetch('cuento.pdf');
        if (!response.ok) {
            throw new Error(`No se encontró el archivo cuento.pdf (Estado: ${response.status})`);
        }
        
        const pdfData = await response.arrayBuffer();
        await processAndRenderPDF(pdfData);
    } catch (error) {
        console.error('Error al cargar el cuento:', error);
        loading.innerHTML = `⚠️ <strong>Error:</strong> No se pudo cargar 'cuento.pdf'. Asegúrate de que el archivo existe en el repositorio.`;
    }
}

// Procesa el PDF, dibuja las páginas y extrae el texto
async function processAndRenderPDF(pdfData) {
    try {
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        const totalPages = pdf.numPages;

        bookContainer.innerHTML = '';
        extractedTextByPage = [];

        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // 6. Extracción de texto accesible para SpeechSynthesis y Lector de Pantalla
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            extractedTextByPage.push(pageText || `Página ${pageNum} sin texto accesible.`);

            // Renderizado en Canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        // Configuración de la librería PageFlip (efectos de transición)
        bookContainer.style.display = 'block';
        
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth,
            minHeight: 400,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // 5. Efecto de sonido y sincronización al cambiar página
        pageFlip.on('flip', (e) => {
            playPageFlipSound();
            stopSpeech();
            updatePageUI();
        });

        loading.style.display = 'none';
        updatePageUI();

    } catch (error) {
        console.error('Error procesando el PDF:', error);
        loading.innerText = 'Error al interpretar el contenido del PDF.';
    }
}

// Configurar Botones e Interacciones
function setupEventListeners() {
    // 4. Navegación
    btnPrev.addEventListener('click', () => {
        if (pageFlip) pageFlip.flipPrev();
    });

    btnNext.addEventListener('click', () => {
        if (pageFlip) pageFlip.flipNext();
    });

    // 3 y 8. Agrandar y achicar texto/pantalla
    btnZoomIn.addEventListener('click', () => adjustZoom(0.1));
    btnZoomOut.addEventListener('click', () => adjustZoom(-0.1));

    // 3. Lectura en Voz Alta
    btnReadAloud.addEventListener('click', speakCurrentPage);
    btnStopRead.addEventListener('click', stopSpeech);
}

// Actualizar número de página e informar a lectores de pantalla
function updatePageUI() {
    if (!pageFlip) return;
    
    const currentPage = pageFlip.getCurrentPageIndex() + 1;
    const totalPages = pageFlip.getPageCount();
    
    pageIndicator.innerText = `Página ${currentPage} de ${totalPages}`;

    // Anuncio para lectores de pantalla (NVDA, JAWS, etc.)
    const currentText = extractedTextByPage[currentPage - 1] || '';
    screenReaderText.innerText = `Página ${currentPage}. ${currentText}`;
}

// 5. Efecto de sonido sintético de pasar página (Web Audio API)
function playPageFlipSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.15; // 150ms de sonido
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        // Generar ruido blanco suave estilo papel
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, audioCtx.currentTime);

        noise.connect(filter);
        filter.connect(audioCtx.destination);

        noise.start();
    } catch (e) {
        // En caso de que el navegador no lo soporte o no haya interacción previa
    }
}

// 3. Función de Lectura en Voz Alta para alumnos con baja visión
function speakCurrentPage() {
    stopSpeech(); // Detener cualquier lectura activa previa

    if (!pageFlip) return;
    
    const pageIndex = pageFlip.getCurrentPageIndex();
    const textToRead = extractedTextByPage[pageIndex];

    if (!textToRead || textToRead.trim() === '') {
        alert('No se detectó texto en esta página para leer.');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES'; // Voz en español
    utterance.rate = 0.9;     // Velocidad ligeramente reducida para mejor comprensión

    // Intentar buscar una voz en español disponible
    const voices = synth.getVoices();
    const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

    synth.speak(utterance);
}

function stopSpeech() {
    if (synth && synth.speaking) {
        synth.cancel();
    }
}

// 8. Ajuste de Zoom
function adjustZoom(delta) {
    zoomLevel = Math.min(Math.max(0.7, zoomLevel + delta), 1.6);
    document.documentElement.style.setProperty('--zoom-factor', zoomLevel);
}