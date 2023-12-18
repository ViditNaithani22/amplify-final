document.addEventListener('DOMContentLoaded', function () {
    let currentUser = localStorage.getItem('currentUser');
    let universitiesData = {};
    let personalizeRecommendations = {};
    let sentimentChartInstance = null;
    let userInteractions = {};

    const loginModal = document.getElementById('loginModal');
    const app = document.getElementById('app');
    const usernameInput = document.getElementById('usernameInput');
    const loginButton = document.getElementById('loginButton');
    const searchBar = document.getElementById('searchBar');
    const header = document.querySelector('header');

    function showLoginModal() {
        loginModal.style.display = 'flex';
        app.style.filter = 'blur(3px)';
    }
    function logout() {
        localStorage.removeItem('currentUser');
        currentUser = null;
        document.getElementById('welcomeMessage').textContent = '';
        document.getElementById('logoutButton').style.display = 'none';
        showLoginModal();
    }

    window.logout = logout;

    function hideLoginModal() {
        loginModal.style.display = 'none';
        app.style.filter = 'none';
    }

    function initializeApp() {
        if (currentUser) {
            document.getElementById('welcomeMessage').textContent = `Welcome, ${currentUser}!`;
            document.getElementById('logoutButton').style.display = 'block';
            hideLoginModal();
        } else {
            document.getElementById('welcomeMessage').textContent = '';
            document.getElementById('logoutButton').style.display = 'none';
            showLoginModal();
        }
        if (searchBar) {
            console.log("Initializing application...");
            fetchCsvData('https://uniview-dynamodb.s3.us-east-2.amazonaws.com/interactions.csv', processUniversityData);
            fetchJsonData('https://uniview-dynamodb.s3.us-east-2.amazonaws.com/personalize_recommendations.json', processPersonalizeRecommendations);
            setupSearchListener();
        }
        var logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', logout);
        }
    }
    function setupSearchListener() {
        document.getElementById('searchBar').addEventListener('input', function (e) {
            const searchTerm = e.target.value.toLowerCase();
            const filteredNames = Object.keys(universitiesData).filter(name => name.toLowerCase().includes(searchTerm));
            displayUniversityCards(filteredNames);
        });
    }

    loginButton.addEventListener('click', function () {
        const username = usernameInput.value;
        if (username) {
            localStorage.setItem('currentUser', username);
            currentUser = username;
            initializeApp();
        } else {
            alert("Please enter a username.");
        }
    });

    if (currentUser) {
        hideLoginModal();
        initializeApp();
    } else {
        showLoginModal();
    }

    function fetchCsvData(csvUrl, callback) {
        console.log(`Fetching data from: ${csvUrl}`);
        Papa.parse(csvUrl, {
            download: true,
            header: true,
            complete: results => callback(results.data)
        });
    }

    function fetchJsonData(jsonUrl, callback) {
        console.log(`Fetching data from: ${jsonUrl}`);
        fetch(jsonUrl)
            .then(response => response.json())
            .then(data => callback(data))
            .catch(error => console.error('Error fetching JSON:', error));
    }
    function processPersonalizeRecommendations(data) {
        console.log("Processing Personalize recommendations...");
        personalizeRecommendations = data;
    }

    function processUniversityData(data) {
        console.log("Processing university data...");
        universitiesData = data.reduce((acc, row) => {
            if (!acc[row.ITEM_ID]) {
                acc[row.ITEM_ID] = {
                    reviews: [],
                    positiveKeywords: new Set(),
                    negativeKeywords: new Set(),
                    sentimentScores: []
                };
            }
            acc[row.ITEM_ID].reviews.push(row);
            row.POSITIVE_KEYWORDS?.split(',').forEach(kw => acc[row.ITEM_ID].positiveKeywords.add(kw.trim()));
            row.NEGATIVE_KEYWORDS?.split(',').forEach(kw => acc[row.ITEM_ID].negativeKeywords.add(kw.trim()));

            acc[row.ITEM_ID].sentimentScores.push({
                positive: parseFloat(row.POSITIVE_SCORE),
                negative: parseFloat(row.NEGATIVE_SCORE),
                neutral: parseFloat(row.NEUTRAL_SCORE)
            });
            return acc;
        }, {});
        console.log("Processed universitiesData:", universitiesData);
        displayUniversityCards();
    }

    function displayUniversityCards(filteredNames) {
        const universityList = document.getElementById('universityList');
        universityList.innerHTML = '';

        // Determine which names to show: either the filtered names or all names
        const namesToShow = filteredNames || Object.keys(universitiesData);

        namesToShow.forEach(name => {
            const details = universitiesData[name];
            const card = document.createElement('div');
            card.className = 'university-card';

            const uniImage = document.createElement('img');
            uniImage.src = details.logoUrl || 'book-303927_1280.png';
            uniImage.alt = name;
            uniImage.className = 'university-logo';

            const uniName = document.createElement('div');
            uniName.className = 'university-name';
            uniName.textContent = name;

            card.appendChild(uniImage);
            card.appendChild(uniName);

            // Set onclick event here
            card.onclick = () => {
                displayUniversityDetails(name);
                updateUserInteractions(name);
            };

            universityList.appendChild(card);
        });
    }


    function displayUniversityDetails(name) {
        const details = universitiesData[name];
        createModal(name, details);
        updateUserInteractions(name);
        getRecommendations(currentUser, name);
    }

    function getRecommendations(userId, universityId) {
        let recommendedUniversities;

        if (Object.keys(userInteractions).length >= 5) {
            recommendedUniversities = calculatePersonalizedRecommendations(userId);
        } else {
            recommendedUniversities = getInitialRecommendations(universityId);
        }

        updateRecommendationsList(recommendedUniversities, universityId);
    }

    function calculatePersonalizedRecommendations(userId) {
        let interactedUniversities = Object.keys(userInteractions);

        let averageSentiments = interactedUniversities.map(universityId => {
            let scores = universitiesData[universityId].sentimentScores;
            let avgPositive = scores.reduce((acc, curr) => acc + curr.positive, 0) / scores.length;
            let avgNegative = scores.reduce((acc, curr) => acc + curr.negative, 0) / scores.length;
            return { universityId, avgPositive, avgNegative };
        });

        averageSentiments.sort((a, b) => b.avgPositive - a.avgPositive);

        let recommendedUniversities = [];
        averageSentiments.forEach(sentiment => {
            Object.keys(universitiesData).forEach(universityId => {
                if (!userInteractions[universityId]) {
                    let scores = universitiesData[universityId].sentimentScores;
                    let avgPositive = scores.reduce((acc, curr) => acc + curr.positive, 0) / scores.length;
                    let avgNegative = scores.reduce((acc, curr) => acc + curr.negative, 0) / scores.length;

                    if (Math.abs(avgPositive - sentiment.avgPositive) < 0.1 && Math.abs(avgNegative - sentiment.avgNegative) < 0.1) {
                        recommendedUniversities.push(universityId);
                    }
                }
            });
        });

        return [...new Set(recommendedUniversities)].slice(0, 5);
    }


    function getInitialRecommendations(currentUniversityId) {
        let recommendations = personalizeRecommendations[currentUniversityId]?.recommendedItems;
        return recommendations ? recommendations.slice(0, 5) : []; // Limit to top 5
    }

    function calculateRecommendationsForUser(userId) {
        console.log(`Calculating recommendations for existing user: ${userId}`);
        // Logic to get recommendations for existing users
        // For simplicity, we'll recommend the top 5 universities based on the user's interaction history
        const userInteractions = userUniversityMatrix[userId];
        const recommendedUniversities = [];
        for (let university in userInteractions) {
            if (userInteractions[university] > 0) {
                recommendedUniversities.push(university);
            }
        }
        return recommendedUniversities.slice(0, 5);
    }

    function getMatrixBasedRecommendations(userId, universityName) {
        const userSimilarities = userSimilarityMatrix[userId] || {};
        const sortedSimilarUsers = Object.entries(userSimilarities)
            .sort((a, b) => b[1] - a[1])
            .slice(1, 6);

        const recommendedUniversities = sortedSimilarUsers.map(([similarUserId, _]) =>
            getPreferredUniversityForUser(similarUserId)).filter(Boolean);

        updateRecommendationsList(recommendedUniversities, universityName);
    }

    function getPreferredUniversityForUser(userId) {
        let topUniversity = '';
        let topScore = -1;

        Object.values(universitiesData).forEach(university => {

            university.reviews.forEach(review => {
                if (review.USER_ID === userId && review.POSITIVE_SCORE > topScore) {
                    topScore = review.POSITIVE_SCORE;
                    topUniversity = review.ITEM_ID;
                }
            });
        });

        return topUniversity;
    }

    function updateRecommendationsList(recommendedUniversities, universityName) {
        console.log(`Updating recommendations list for: ${universityName}`);
        const recommendationsListId = `recommendations-list-${universityName.replace(/\s+/g, '-')}`;
        const recommendationsList = document.getElementById(recommendationsListId);
        if (recommendationsList) {
            if (recommendedUniversities.length > 0) {
                recommendationsList.innerHTML = '';
                recommendedUniversities.forEach(recommendedUniversity => {
                    // Create a card for each recommended university
                    const card = document.createElement('div');
                    card.className = 'university-card';
                    card.textContent = recommendedUniversity;
                    card.onclick = () => displayUniversityDetails(recommendedUniversity);
                    recommendationsList.appendChild(card);
                });
            } else {
                recommendationsList.innerHTML = '<div>No recommendations available</div>';
            }
        }
    }

    function createModal(name, details) {
        // Remove any existing modal
        const existingModal = document.querySelector('.modal');
        if (existingModal) {
            existingModal.remove();
        }


        // Use a sanitized name for the IDs
        const sanitizedModalName = name.replace(/\s+/g, '-');

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
    <div class="modal-content">
        <span class="close" onclick="this.parentElement.parentElement.style.display='none'">&times;</span>
        <h2>${name}</h2>
        <div class="modal-body">
            <div class="chart-container">
                <h3>Sentiment Analysis</h3>
                <canvas id="sentimentChart-${sanitizedModalName}"></canvas>
            </div>
            <div class="keywords-section">
                <div class="keywords-container">
                    <h3>Positive Keywords</h3>
                    <ul>${Array.from(details.positiveKeywords).map(kw => `<li>${kw}</li>`).join('')}</ul>
                </div>
                <div class="keywords-container">
                    <h3>Negative Keywords</h3>
                    <ul>${Array.from(details.negativeKeywords).map(kw => `<li>${kw}</li>`).join('')}</ul>
                </div>
            </div>
            <div class="score-container">
                <h3>Average Sentiment Scores</h3>
                <p><strong>Positive:</strong> ${calculateAverageScore(details.sentimentScores, 'positive')}%</p>
                <p><strong>Negative:</strong> ${calculateAverageScore(details.sentimentScores, 'negative')}%</p>
                <p><strong>Neutral:</strong> ${calculateAverageScore(details.sentimentScores, 'neutral')}%</p>
            </div>
            <div class="personalized-recommendations">
                <h3>Personalized Recommendations</h3>
                <ul id="recommendations-list-${sanitizedModalName}"></ul>
            </div>
        </div>
    </div>`;
        document.body.appendChild(modal);
        createSentimentChart(calculateSentimentCounts(details.reviews), `sentimentChart-${sanitizedModalName}`);
        modal.style.display = 'block';
    }


    function getPersonalizeRecommendations(universityName, details) {
        fetch('https://i978sjfn4d.execute-api.us-east-2.amazonaws.com/prod', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: universityName })
        })
            .then(response => response.json())
            .then(data => {
                const recommendationsList = document.getElementById('recommendations-list');
                recommendationsList.innerHTML = data.recommendations.map(item => `<li>${item}</li>`).join('');
                createModal(universityName, details);
            })
            .catch(error => console.error('Error:', error));
    }
    function updateUserInteractions(universityId) {
        userInteractions[universityId] = (userInteractions[universityId] || 0) + 1;
        if (Object.keys(userInteractions).length % 5 === 0) {
            updateDynamicRecommendations();
        }
    }

    function updateDynamicRecommendations() {
        const recentInteractions = Object.entries(userInteractions)
            .sort((a, b) => b[1] - a[1]) // Sort by interaction count
            .slice(0, 5) // Get top 5
            .map(entry => entry[0]); // Extract university names

        // Update the recommendation list with these recent interactions
        updateRecommendationsList(recentInteractions, currentUser);
    }


    function createSentimentChart(counts, canvasId) {
        if (sentimentChartInstance) {
            sentimentChartInstance.destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');
        sentimentChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Positive', 'Negative', 'Neutral'],
                datasets: [{
                    label: 'Sentiment Analysis',
                    data: Object.values(counts),
                    backgroundColor: ['green', 'red', 'blue'],
                    borderColor: ['darkgreen', 'darkred', 'darkblue'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Do not maintain the aspect ratio
                layout: {
                    padding: {
                        top: 15,
                        bottom: 15
                    }
                },
                plugins: {
                    legend: {
                        position: 'top' // Adjust legend position as needed
                    }
                }
            }
        });
    }

    function calculateSentimentCounts(reviews) {
        return reviews.reduce((counts, review) => {
            counts[review.EVENT_VALUE] = (counts[review.EVENT_VALUE] || 0) + 1;
            return counts;
        }, { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0, MIXED: 0 });
    }

    function calculateAverageScore(scores, type) {
        const total = scores.reduce((acc, score) => acc + score[type], 0);
        return (total / scores.length * 100).toFixed(2);
    }

    document.getElementById('searchBar').addEventListener('input', function (e) {
        const searchTerm = e.target.value.toLowerCase();
        const filteredNames = Object.keys(universitiesData).filter(name => name.toLowerCase().includes(searchTerm));
        displayUniversityCards(filteredNames);
    });
    initializeApp();
});