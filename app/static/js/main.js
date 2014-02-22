var LobbyState = {
    LOBBY_STATE_CREATE: 1,
    LOBBY_STATE_IDLE: 2,
    LOBBY_STATE_SEARCH: 3,
    LOBBY_STATE_PLAY: 4,
    LOBBY_STATE_UNUSED: 5
}

var pug = {
    lobbyid: null,
    lobbypoll: 0,
    lobbydata: null,
    config: {},
    pollLobbyInterval: null,
    getStatsInterval: null,
    bg: false,
    socket: null,

    pushurl: function(url) {
        if (history) {
            history.pushState({}, '', url)
        }
    },

    msg: function(content, type, location, dismiss, cls) {
        var cls = cls ? cls : "";
        var dismiss = dismiss ? '<i class="icon-remove close" data-dismiss="alert"></i> ' : '';
        var alert = '<div style="text-align: center;" class="alert alert-'+type+' fade in '+cls+'">'+dismiss+content+'</div>';
        $(location).prepend(alert);
    },

    hidemsg: function(cls) {
        $("."+cls).remove();
    },

    vglobal: function() {
        var search_base = _.template('<li class="search-result"><a href="/user/<%= u.username %>"><div class="col-left">'+
                        '<span class="label label-info"><i class="icon-star"></i></span>'+
                        '</div><div class="col-right with-margin">'+
                        '<span class="message"><strong><%= u.username %></strong></span>'+
                        '<span class="time">32 Pugs Played</span></div></a> </li>')
        var search = function() {
            $(".search-result").remove()
            $.ajax("/api/users/search", {
                type: "POST",
                data: {
                    query: $("#search-input").val()
                },
                success: function (data) {
                    $(".sidebar-search-results").slideDown(200);
                    if (data.success) {
                        for (eid in data.results) {
                            $("#search-results").append(search_base({u: data.results[eid]}))
                        }
                    }
                }
            })
        }

        $('#search-submit').click(function(e) {
            e.preventDefault()
            search()
        })
        $('#search-input').keypress(function(e) {
            if(e.which == 13) {
                e.preventDefault();
                search()
            }
        });

        $(".sidebar-search-results .close").click(function () {
            $(".sidebar-search-results").slideUp(200)
        });

        // Start up some socket shit dawg
        var port = location.port ? ":"+location.port : ""
        pug.socket = io.connect('http://' + document.domain + port + "/api/poll");
        pug.socket.on('lobby', pug.lobbyHandleMsg);
        pug.socket.on('global', pug.handleGlobal);

        // This interval makes sure we stay active in lobbies/etc
        setInterval(function () {
            pug.socket.emit("ping", {ping: 1})
        }, 1000 * 5)
    },

    handleGlobal: function (msg) {
        console.log(msg)
        if (msg.type == "stats") {
            pug.handleStats(msg.data);
        }
    },

    lobby: function (id) {
        pug.vglobal();
        if (id) {
            pug.lobbyJoin(id);
        } else {
            $("#lobby").hide();
            $("#btn-create-lobby").click(pug.lobbyCreate);
        }
    },

    lobbyHandleMsg: function (data) {
        switch(data.type) {
            case "chat":
                pug.lobbyAddChat(data.from, data.msg)
                break;
            case "join":
                pug.lobbyAddMember(data.member);
                pug.lobbyAddAction(data.msg, "success");
                break;
            case "quit":
                pug.lobbyRmvMember(data.member.id);
                pug.lobbyAddAction(data.msg, "danger");
                break;
            case "state":
                pug.lobbyHandleState(data.state);
                pug.lobbyAddAction(data.msg, "warning");
                break;
            case "msg":
                pug.lobbyAddAction(data.msg, "danger");
                break;
            default:
                console.log("WTF:")
                console.log(data)
                break;
        }
    },

    lobbyCreate: function(e) {
        // This should never happen unless people are firing manual events
        if (pug.lobbyid) {
            console.log("Wat. Da. Faq?");
            alert("Something went wrong! (Refresh the page?)");
            return
        }

        // Fade out the lobby creation wizard, and add in the loader
        $("#lobby-create-wizard").hide();
        $("#lobby-create-loader").fadeIn();

        // Function that handles error state
        var error = function (data) {
            var msg = data.msg ? data.msg : "Something went wrong!"
            // We hide the loader and reshow the wizard, in case its a user-correctabble
            //  error.
            $("#lobby-create-loader").hide();
            $("#lobby-create-wizard").show();
            pug.msg(msg, "danger", "#lobby-maker-main", false, "lobby-maker-err");
        }

        // Hide old errors
        pug.hidemsg("lobby-maker-err");

        // Make the request
        $.ajax("/api/lobby/create", {
            type: "POST",
            data: pug.config,
            success: function(data) {
                console.log(data)
                // Well dix, looks like we failed...
                if (!data.success) {
                    error(data);
                }
                // Hide loader
                $("#lobby-create-loader").hide();
                // Save lobby id, render
                pug.lobbyid = data.id;

                pug.pushurl(window.location+"/"+data.id)
                pug.lobbydata = data;
                pug.lobbyRender();
            },
            error: error
        })
    },

    lobbyJoin: function(id) {
        console.log("lobbyJoin")
        if (!pug.lobbyid) {
            pug.lobbyid = id;
        }

        $.ajax("/api/lobby/info", {
            data: {
                id: pug.lobbyid
            },
            success: function (data) {
                console.log(data)
                if  (data.success) {
                    pug.lobbydata = data.lobby
                    pug.lobbyRender()
                }
            }
        });
        
    },

    lobbyMemberTemplate: _.template('<tr id="member-<%= m.id %>"><td><%= m.username %>'+
        '<% if (leader) { %><span class="label label-danger lobby-kick">X</span><% } %></td></tr>'),

    lobbyAddMember: function(m) {
        var isLeader = (USER.id == pug.lobbydata.owner)
        $("#lobby-member-list").append(pug.lobbyMemberTemplate({m: m, leader: isLeader}));
    },

    lobbyRmvMember: function(id) {
        $("#member-"+id).remove();
    },

    lobbyRender: function() {
        $("#lobby-maker").hide();
        $("#lobby").show();
        $("#lobby-chat-list").slimScroll({
            height: '350px',
            start: 'bottom',
        });

        if (pug.lobbydata.owner != USER.id) {
            $(".not-owner").show()
        } else {
            $(".owner").show()
        }

        $.each(pug.lobbydata.members, function(_, v) {
            console.log(v);
           pug.lobbyAddMember(v)
        })

        $("#lobby-queue-start").click(function () {
            $.ajax("/api/lobby/action", {
                type: "POST",
                data: {
                    id: pug.lobbyid,
                    action: "start"
                },
                success: pug.lobbyPollStart
            })
        });
        $("#lobby-queue-stop").click(function () {
            $.ajax("/api/lobby/action", {
                type: "POST",
                data: {
                    id: pug.lobbyid,
                    action: "stop"
                },
                success: pug.lobbyPollStart
            })
        });

        $("#lobby-leave").click(function () {
            $.ajax("/api/lobby/action", {
                type: "POST",
                data: {
                    id: pug.lobbyid,
                    action: "leave"
                },
                success: function (data) {
                    if (data.success) {
                        window.location = '/'
                    }
                }
            })
        })

        // The following handles sending chat messages
        var send_lobby_chat = function () {
            var msg = $("#lobby-chat-text").val();
            $.ajax("/api/lobby/chat", {
                type: "POST",
                data: {
                    id: pug.lobbyid,
                    msg: msg
                },
                success: function(data) {
                    if (data.success) {
                        $("#lobby-chat-text").val("");
                    }
                }
            })
        }
        // Bind send button
        $("#lobby-chat-send").click(send_lobby_chat)
        // Bind the enter key
        $('#lobby-chat-text').keypress(function(e) {
            if(e.which == 13) {
                send_lobby_chat();
            }
        });
        pug.lobbyHandleState(pug.lobbydata.state)

        $("#lobby-invite-btn").click(function () {
            $("#invite-modal").modal('show')
        })
    },

    lobbyHandleState: function(state) {
        switch (state) {
            case LobbyState.LOBBY_STATE_CREATE:
            case LobbyState.LOBBY_STATE_IDLE:
            case LobbyState.LOBBY_STATE_UNUSED:
                $("#lobby-info-main-queued").hide();
                $("#lobby-info-main-waiting").show();
                break;
            case LobbyState.LOBBY_STATE_SEARCH:
                $("#lobby-info-main-queued").show();
                $("#lobby-info-main-waiting").hide();
                break;
        }
    },

    lobbyAddChat: function(from, msg) {
        $("#lobby-chat-list").append('<li class="list-group-item basic-alert"><b>'+from+':</b> '+msg+'</li>')
        $("#lobby-chat-list").animate({ scrollTop: $('#lobby-chat-list')[0].scrollHeight}, 700);
    },

    lobbyAddAction: function(text, color) {
        var extra = color ? ' class="text-'+color+'" ' : ''
        $("#lobby-chat-list").append('<li class="list-group-item basic-alert"><i'+extra+'>'+text+'</i></li>')
        $("#lobby-chat-list").animate({ scrollTop: $('#lobby-chat-list')[0].scrollHeight}, 700);
    },

    handleStats: function (data) {
        $(".apistats").each(function (_, i) {
            var id = $(i).attr("id").split(".")
            var base = data;
            for (get in id) {
                base = base[id[get]]
            }
            $(i).text(base)
        })
    },

    // Loads stats from the backend and dynamically loads them into values
    getStats: function () {
        $.ajax("/api/stats", {success: pug.handleStats})
    },

    friends: function() {
        pug.vglobal();
        $(".friends-unfriend").click(function (e) {
            console.log($($(this).parent()).attr("id"))
            console.log($(this))
            $.ajax("/api/users/unfriend", {
                type: "POST",
                data: {
                    id: $(this).attr("id")
                },
                success: function (data) {
                    if (data.success) {
                        // FIXME
                        $($(this).parent()).remove()
                        pug.msg("Removed friend!", "success", "#friends-main", true)
                    }
                }
            });
        });

        $(".friends-deny").click(function (e) {
            $.ajax("/api/invites/deny", {
                type: "POST",
                data: {
                    id: $(this).attr("id")
                },
                success: function (data) {
                    if (data.success) {
                        // FIXME
                        $($(this).parent()).remove()
                        pug.msg("Denied Friend Invite!", "warning", "#friends-main", true)
                    }
                }
            })
        });

        $(".friends-accept").click(function (e) {
            $.ajax("/api/invites/accept", {
                type: "POST",
                data: {
                    id: $(this).attr("id")
                },
                success: function (data) {
                    if (data.success) {
                        // FIXME
                        $($(this).parent()).remove()
                        pug.msg("Accepted Friend Invite!", "success", "#friends-main", true)
                    }
                }
            })
        });
    },

    profile: function(u) {
        $.ajax("/api/users/stats", {
            data: {
                id: u.id
            },
            success: function (data) {
                if (data.success) {
                    graph_drawPlayerOverview(data.stats, "#profile-graph-overview")
                }
            }
        })
    },
}

// var backgroundTimeout = null;
// $(window).focus(function() {
//     // Woah wait up guys I'm back!
//     clearTimeout(backgroundTimeout);
//     pug.bg = false;
//             pug.lobbyPollStart();
//         pug.runGetStats();
// });

// $(window).blur(function() {
//     // If the client window is idle for more than 15 minutes, all the refresh timers get set long
//     //  to prevent major spamming of the backend
//     backgroundTimeout = setTimeout(function () {
//         pug.bg = true;
//         pug.lobbyPollStart();
//         pug.runGetStats();
//     }, 60000 * 15)
// });

$(document).ready(function () {
    pug.getStats();
});