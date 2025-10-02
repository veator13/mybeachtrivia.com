// jsPDF is loaded globally from a script tag in the HTML
// No need to import it here

// Bingo Board Generator Module
const BingoBoardGenerator = (() => {
    // Constants
    const BOARD_SIZE = 5; // 5x5 grid
    const CENTER_ROW = 2;
    const CENTER_COL = 2;
    const CENTER_TEXT = "Like Beach Trivia\nOn Facebook";
    const SONG_RATIO = 0.7; // 70% songs, 30% artists
    
    // Function to shuffle an array
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };
    
    // Function to generate a single random board
    const generateBoard = (songArtistPairs) => {
        // Create a copy of the data to work with
        const availableData = [...songArtistPairs];
        
        // Shuffle the data
        const shuffledData = shuffleArray(availableData);
        
        // Calculate how many total entries we need (5x5 grid minus center square)
        const totalEntries = BOARD_SIZE * BOARD_SIZE - 1;
        
        // Calculate how many songs versus artists to use based on ratio
        const numSongs = Math.floor(totalEntries * SONG_RATIO);
        const numArtists = totalEntries - numSongs;
        
        // Create arrays of songs and artists
        const songs = shuffledData.map(pair => ({ text: pair.song, type: 'song' })).slice(0, numSongs);
        const artists = shuffledData.map(pair => ({ text: pair.artist, type: 'artist' })).slice(0, numArtists);
        
        // Combine and shuffle again
        const boardEntries = shuffleArray([...songs, ...artists]);
        
        // Create the 5x5 grid
        const board = [];
        let entryIndex = 0;
        
        for (let row = 0; row < BOARD_SIZE; row++) {
            const boardRow = [];
            for (let col = 0; col < BOARD_SIZE; col++) {
                // Place the fixed center text
                if (row === CENTER_ROW && col === CENTER_COL) {
                    boardRow.push({ text: CENTER_TEXT, type: 'center' });
                } else {
                    // Place the next entry from the shuffled list
                    boardRow.push(boardEntries[entryIndex]);
                    entryIndex++;
                }
            }
            board.push(boardRow);
        }
        
        return board;
    };
    
    // Function to generate multiple unique boards
    const generateMultipleBoards = (songArtistPairs, numBoards) => {
        // Ensure we have enough songs/artists to create unique boards
        if (songArtistPairs.length < 40) {
            throw new Error('Need at least 40 songs to generate unique bingo boards');
        }
        
        const boards = [];
        for (let i = 0; i < numBoards; i++) {
            boards.push(generateBoard(songArtistPairs));
        }
        
        return boards;
    };
    
    // Function to create PDF with multiple boards - two boards side by side in landscape
    const createPDF = (playlistName, boards) => {
        // Create new PDF document (landscape, mm units)
        const pdf = new jspdf.jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });
        
        // Set default styles
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        
        // Calculate page dimensions
        const pageWidth = pdf.internal.pageSize.getWidth(); // Now wider (297mm for A4)
        const pageHeight = pdf.internal.pageSize.getHeight(); // Now shorter (210mm for A4)
        const margin = 10;
        
        // Calculate board dimensions to fit two side by side
        const boardWidth = (pageWidth - (margin * 3)) / 2; // Divide available width by 2
        const boardHeight = 110; // Height adjusted for landscape
        const cellWidth = boardWidth / BOARD_SIZE;
        const cellHeight = boardHeight / BOARD_SIZE;
        
        // Define positions for both boards
        const firstBoardStartX = margin;
        const secondBoardStartX = margin * 2 + boardWidth;
        const boardStartY = 25; // Reduced to give less space between title and boards
        
        // Process boards in pairs
        for (let pageIndex = 0; pageIndex < boards.length; pageIndex += 2) {
            // Add a new page for each pair of boards after the first pair
            if (pageIndex > 0) {
                pdf.addPage();
            }
            
            // Add page title - removed "- Boards X-Y" text
            pdf.setFontSize(18);
            pdf.text(`${playlistName}`, pageWidth / 2, 15, { align: 'center' });
            
            // Draw both boards on the page (if available)
            for (let boardOffset = 0; boardOffset < 2; boardOffset++) {
                const boardIndex = pageIndex + boardOffset;
                
                // Check if we have a board to draw
                if (boardIndex >= boards.length) {
                    break;
                }
                
                const board = boards[boardIndex];
                const startX = boardOffset === 0 ? firstBoardStartX : secondBoardStartX;
                
                // Board headers removed as requested
                // pdf.setFontSize(14);
                // pdf.text(`Board ${boardIndex + 1} - Sing Along Songs`, startX + (boardWidth / 2), boardStartY - 5, { align: 'center' });
                
                // Draw each cell of the board
                board.forEach((row, rowIndex) => {
                    row.forEach((cell, colIndex) => {
                        // Calculate cell position
                        const x = startX + (colIndex * cellWidth);
                        const y = boardStartY + (rowIndex * cellHeight);
                        
                        // Draw cell border
                        pdf.setDrawColor(0);
                        pdf.setLineWidth(0.5);
                        pdf.rect(x, y, cellWidth, cellHeight);
                        
                        // Format and draw cell text
                        pdf.setFontSize(8); // Smaller font for cell content
                        
                        // Handle text wrapping for each cell
                        if (cell.type === 'center') {
                            // Center square with "Like Beach Trivia On Facebook"
                            // No background color or special border as requested
                            
                            // Use normal border like other cells
                            pdf.setDrawColor(0);
                            pdf.setLineWidth(0.5);
                            pdf.rect(x, y, cellWidth, cellHeight);
                            
                            const centerLines = cell.text.split('\n');
                            
                            // Use medium font with padding
                            pdf.setFont('helvetica', 'bold');
                            pdf.setFontSize(10);
                            pdf.setTextColor(0, 0, 0); // Black text
                            
                            // Draw each line of center text with improved spacing and padding
                            // Reducing padding to ensure text has more space
                            const padding = cellWidth * 0.1; // Reduced from 15% to 10% padding on each side
                            const effectiveWidth = cellWidth - (padding * 2);
                            const lineSpacing = 7; // Increased spacing between lines
                            
                            centerLines.forEach((line, lineIndex) => {
                                const lineY = y + (cellHeight / 2) - ((centerLines.length - 1) * lineSpacing / 2) + (lineIndex * lineSpacing);
                                pdf.text(line, x + (cellWidth / 2), lineY, { align: 'center', maxWidth: effectiveWidth });
                            });
                            
                        } else {
                            // Regular cell with song or artist
                            const text = cell.text;
                            
                            // Enhanced text wrapping for cells
                            if (text) {
                                // Calculate max width that will fit in a cell (in points)
                                // Reduced padding from 2mm to 1mm on each side to give more space for text
                                const maxWidth = cellWidth - 2; // 1mm padding on each side (reduced from 4)
                                
                                // Increase the font size for song and artist names slightly
                                const fontSize = 10.5; // Increased from 9 to 10.5 to make text slightly larger
                                pdf.setFontSize(fontSize);
                                
                                // Use normal font weight instead of bold for better readability
                                pdf.setFont('helvetica', 'normal');
                                
                                // Split text into lines that fit within cell width
                                const words = text.split(' ');
                                const lines = [];
                                let currentLine = '';
                                
                                // Build lines word by word with improved wrapping for longer titles
                                words.forEach(word => {
                                    const testLine = currentLine ? `${currentLine} ${word}` : word;
                                    const testWidth = pdf.getStringUnitWidth(testLine) * fontSize / pdf.internal.scaleFactor;
                                    
                                    if (testWidth <= maxWidth) {
                                        currentLine = testLine;
                                    } else {
                                        // If the current line is too long for a single word, split the word
                                        if (!currentLine && word.length > 10) {
                                            // Find a good splitting point
                                            const halfLength = Math.floor(word.length / 2);
                                            lines.push(word.substring(0, halfLength) + '-');
                                            currentLine = word.substring(halfLength);
                                        } else {
                                            lines.push(currentLine);
                                            currentLine = word;
                                        }
                                    }
                                });
                                
                                // Add the last line
                                if (currentLine) {
                                    lines.push(currentLine);
                                }
                                
                                // Limit to 4 lines maximum (increased from 3)
                                const displayLines = lines.slice(0, 4);
                                if (lines.length > 4) {
                                    // Add ellipsis to last line but use less space for it
                                    let lastLine = displayLines[3];
                                    if (lastLine.length > 3) {
                                        // Just use 3 dots instead of 4 to save space
                                        displayLines[3] = lastLine.substring(0, lastLine.length - 3) + '...';
                                    }
                                }
                                
                                // Center text vertically
                                const lineHeight = fontSize * 1.03 / pdf.internal.scaleFactor; // Reduced line height multiplier slightly
                                const totalTextHeight = displayLines.length * lineHeight;
                                let textY = y + (cellHeight - totalTextHeight) / 2 + lineHeight; // Start Y for first line
                                
                                // Draw each line centered horizontally
                                displayLines.forEach(line => {
                                    pdf.text(line, x + cellWidth / 2, textY, { align: 'center' });
                                    textY += lineHeight;
                                });
                                
                                // Reset to bold for other elements
                                pdf.setFont('helvetica', 'bold');
                            }
                        }
                    });
                });
            }
            
            // Draw the footer with image instead of text
            const footerY = boardStartY + boardHeight + 5; // Reduced spacing from 10 to 5
            
            // Only add the footer if there's enough space
            if (footerY + 25 <= pageHeight) {
                // Calculate appropriate dimensions for the footer image
                const footerWidth = pageWidth * 0.75; // Reduced from 80% to 75% of page width
                const aspectRatio = 3.5; // Width-to-height ratio (adjust based on actual image)
                const footerHeight = footerWidth / aspectRatio; // Calculate height to maintain aspect ratio
                const footerX = (pageWidth - footerWidth) / 2; // Center horizontally
                
                // Add the footer image
                pdf.addImage('images/footer.JPG', 'JPEG', footerX, footerY, footerWidth, footerHeight);
            }
        }
        
        return pdf;
    };
    
    // Public function to generate and display PDF boards
    const generate = (playlistName, songArtistPairs, numCopies) => {
        try {
            // Generate the requested number of boards
            const boards = generateMultipleBoards(songArtistPairs, numCopies);
            
            // Create the PDF
            const pdf = createPDF(playlistName, boards);
            
            // Open PDF in a new tab
            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
            
            // Return success
            return true;
        } catch (error) {
            console.error('Error generating bingo boards:', error);
            throw error;
        }
    };
    
    // Return public methods
    return {
        generate
    };
})();

// Export the BingoBoardGenerator module
export { BingoBoardGenerator };