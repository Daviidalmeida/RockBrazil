mergeInto(LibraryManager.library, {
    YT_PlayVideo: function () {
        if (window.rockBrazilYouTubePlayer && typeof window.rockBrazilYouTubePlayer.playVideo === 'function') {
            window.rockBrazilYouTubePlayer.playVideo();
        }
    },

    YT_PauseVideo: function () {
        if (window.rockBrazilYouTubePlayer && typeof window.rockBrazilYouTubePlayer.pauseVideo === 'function') {
            window.rockBrazilYouTubePlayer.pauseVideo();
        }
    },

    YT_StopVideo: function () {
        if (window.rockBrazilYouTubePlayer && typeof window.rockBrazilYouTubePlayer.stopVideo === 'function') {
            window.rockBrazilYouTubePlayer.stopVideo();
        }
    },

    YT_GetCurrentTime: function () {
        if (window.rockBrazilYouTubePlayer && typeof window.rockBrazilYouTubePlayer.getCurrentTime === 'function') {
            return window.rockBrazilYouTubePlayer.getCurrentTime();
        }
        return -1.0;
    },

    YT_GetPlayerState: function () {
        if (window.rockBrazilYouTubePlayer && typeof window.rockBrazilYouTubePlayer.getPlayerState === 'function') {
            return window.rockBrazilYouTubePlayer.getPlayerState();
        }
        return -1;
    }
});
