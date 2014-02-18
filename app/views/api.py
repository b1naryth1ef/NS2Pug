from flask import Blueprint, render_template, flash, redirect, request, g, session, jsonify
from database import User, Session, redis, Ban
from util import *
import time, json

api = Blueprint('api', __name__, url_prefix='/api')

@api.route("/info")
@limit(60)
def api_info():
    """
    Returns information regarding the API's state, version and whether the
    current requester is logged in as a user.

    Returned:
        version: The API version, this is for external services.
        status: 1 on OK, -1 on ERR, >1 on other errors (TBD)
        user: optional, if the user is logged in this is their username

    This endpoint is limited to 60 requests per minute.
    """
    data = {
        "success": True,
        "version": 1,
        "status": 1
    }

    if g.user:
        data['user'] = g.user.username

    return jsonify(data)

@api.route("/bans/list")
@limit(120)
def api_bans_list():
    """
    Returns a list of steamid's that have active bans in the system. To get
    more information about a specific ban, use /bans/get.

    Arguments:
        The after and page arguments are exclusive and cannot be mixed.
        page: The page number. Each page returns 100 steamids.
        after: A ban number to start from, can be used in combination with
            size to virtually tail the ban list.

    Returned:
        size: The number of returned steamid's
        bans: A list of banned steamids.

    This endpoint is limited to 120 requests per minute.
    """

    args, _ = require(page=int, after=int)
    data = {
        "success": True,
        "size": 0,
        "bans": []
    }

    if args.after:
        q = Ban.select().where(Ban.id > args.after).order_by(Ban.id).limit(100)
    elif args.page:
        q = Ban.select().order_by(Ban.id).paginate(args.page or 1, 100)
    else:
        data['success'] = False
        data['msg'] = "Need either page or after for /bans/list"
        return jsonify(data)

    data['bans'] = [i.format() for i in q]
    data['size'] = len(data['bans'])

    return jsonify(data)

@api.route("/bans/get")
@limit(60)
def api_bans_get():
    """
    Returns the first active ban for a steamid, banid, or userid. It's
    possible within the system for a user to have multiple active bans,
    however this call will always only return ONE ban.

    Arguments:
        All the arguments in this call are exclusive and cannot be mixed.
        steamid: A steamid to query for.
        banid: A banid to query for.
        userid: A userid to query for

    Returned:
        id: banid
        userid: userid (if any)
        steamid: steamid (if any)
        created: created date
        start: start date (if any)
        end: end date (if any, null = perma)
        reason: the ban reason (if any)
        source: the banner (if any)

    This endpoint is limited to 60 requests per minute.
    """
    args, success = require(steamid=int, banid=int, userid=int)

    if not any([args.steamid, args.banid, args.userid]):
        return jsonify({
            "success": False,
            "msg": "You must specifiy either steamid or banid for /bans/get"
        })

    if args.steamid:
        q = (Ban.steamid == args.steamid)
    if args.banid:
        q = (Ban.id == args.banid)
    if args.userid:
        q = (Ban.user == args.userid)

    try:
        b = Ban.select().where(q & Ban.active == True).order_by(Ban.created.desc()).get()
    except Ban.DoesNotExist:
        return jsonify({"success": False, "msg": "No ban exists for query!"})

    data = b.format()
    data['success'] = True
    return jsonify(data)