import asyncio
import json
import aiohttp
import datetime
import re
import os

# Define global variables to store answers
IS_TEST = True
DESIRED_CLASSIFICATION_LABEL_ID = 0
MIRO_ORG_ID = 0
API_TOKEN = ''
DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS = False

# Constants
GET_BOARDS_REQUESTS_BATCH_NUMBER = 1000
GET_CLASSIFICATION_REQUESTS_BATCH_NUMBER = 25

# Variables
boards_to_classify = []
teams_successfully_classified = {}
boards_successfully_classified = 0

teams = {}
get_unclassified_boards_remaining_team_boards = {}
get_unclassified_boards_processed_items = {}
set_board_classification_remaining_teams = {}
set_board_classification_processed_items = {}
global_processed_urls = {}
boards = []
boards_object = {}

get_unclassified_boards_errors = {}
set_board_classification_errors = {}
get_boards_exclusion_list = {}
get_unclassified_boards_exclusion_list = {}
set_board_classification_exclusion_list = {}
get_teams_errors = []
error_retry_count = 0
get_boards_errors = {}

def json_to_csv(json_data):
    if json_data:
        csv = ''
        # Get the headers
        headers = list(json_data[list(json_data.keys())[0]].keys())
        csv += ','.join(headers) + '\n'
        
        # Helper function to escape CSV special characters
        def escape_csv(value):
            if isinstance(value, (int, float)):
                value = str(value)
            if isinstance(value, str):
                if '"' in value:
                    value = value.replace('"', '""')
                if ',' in value or '"' in value or '\n' in value:
                    value = f'"{value}"'
            return value
        
        # Add the data
        for row in json_data:
            data = ','.join(escape_csv(json_data[row][header]) for header in headers)
            csv += data + '\n'
        
        return csv

def get_strings_between(text, start, end):
    # Create a regular expression dynamically using start and end strings
    regex = re.compile(f"{re.escape(start)}(.*?){re.escape(end)}")
    matches = []

    # Iterate over matches found by the regular expression
    for match in regex.finditer(text):
        # Append the captured group into the matches list
        matches.append(match.group(1))

    # Return the first match
    return matches[0] if matches else None

async def delay(ms):
    await asyncio.sleep(ms / 1000)

async def hold_script_execution(ms):
    print(f'**** Rate limit hit - Delaying execution for {ms/1000} seconds to replenish rate limit credits - Current time: {datetime.datetime.now()} ***')
    await delay(ms)
    print('**** Resuming script execution ***')

async def iterate_through_boards(teams_array, is_error_retry, set_classification):
    global boards, boards_object, get_unclassified_boards_errors, error_retry_count, GET_CLASSIFICATION_REQUESTS_BATCH_NUMBER, set_board_classification_errors

    if not set_classification and not is_error_retry:
        summary = {}
        for team_id, team in teams_array.items():
            if team_id not in summary:
                summary[team_id] = {
                    'teamId': team_id,
                    'teamName': team['team_name'],
                    'numberOfBoards': len(team['all_boards'])
                }
            boards.extend(team['all_boards'])

        for board_id in boards:
            if board_id not in boards_object:
                boards_object[board_id] = {
                    'board_id': board_id,
                    'classification_label': 'unknown'
                }

    for i, team_id in enumerate(teams_array.keys()):
        if not set_classification:
            print(f"Checking for unclassified Boards in Team {team_id} (Team No. {i + 1} of {len(teams)})")
            await get_unclassified_boards(team_id, i, len(teams_array), GET_CLASSIFICATION_REQUESTS_BATCH_NUMBER)
        else:
            await set_board_classification(team_id, i, len(teams_array))

    if not set_classification:
        if get_unclassified_boards_errors:
            print('Errors found. Holding execution for 25 seconds to allow Rate Limit Credits to replenish')
            await hold_script_execution(25000)
            error_retry_count += 1
            if error_retry_count <= 7:
                if error_retry_count == 7:
                    print('This is the third and last attempt to retry failed "getBoards" calls...')
                await iterate_through_boards(get_unclassified_boards_errors, True, set_classification)
            else:
                print('Maximum amount of retry attempts for failed "getUnclassifiedBoards" calls reached. Please review the errors array to find out what the problem is...')
                return False
        else:
            error_retry_count = 0
        if not get_unclassified_boards_errors:
            return await iterate_through_boards(teams_array, False, True)
    else:
        if set_board_classification_errors:
            print('Errors found. Holding execution for 25 seconds to allow Rate Limit Credits to replenish')
            await hold_script_execution(25000)
            error_retry_count += 1
            if error_retry_count < 4:
                if error_retry_count == 3:
                    print('This is the third and last attempt to retry failed "getBoards" calls...')
                await iterate_through_boards(set_board_classification_errors, True, set_classification)
            else:
                print('Maximum amount of retry attempts for failed "getUnclassifiedBoards" calls reached. Please review the errors array to find out what the problem is...')
                return False
        else:
            error_retry_count = 0

async def set_board_classification(team_id, team_index, teams_length):
    global API_TOKEN, MIRO_ORG_ID, teams, set_board_classification_processed_items, set_board_classification_errors, boards_object, boards_to_classify, global_processed_urls, set_board_classification_remaining_teams, set_board_classification_exclusion_list, error_retry_count
    if not IS_TEST:
        results = []
        total_items = len(teams)
        set_board_classification_remaining_teams = {team_id: team_id for team_id in teams}
        
        set_board_classification_processed_items[team_id] = {}
        processed_urls = []
        batch_size = 0

        print(f'# Setting Board Classification ONLY for "NOT YET CLASSIFIED" Boards within Team {team_id} (Team {team_index + 1} out of {teams_length}) - Already classified Boards will not be updated ...')
        api_url = f'https://api.miro.com/v2/orgs/{MIRO_ORG_ID}/teams/{team_id}/data-classification'
        remaining_items = len(total_items) - len(set_board_classification_processed_items[team_id])

        if len(set_board_classification_errors) == 0:
            batch_size = 1
            batch_urls = [api_url]
        else:
            if set_board_classification_errors[list(set_board_classification_errors.keys())[-1]]['error'] == 429:
                print(f"Processed Boards: {len(set_board_classification_processed_items[team_id])} out of {len(total_items)} in Team {team_id} - Team {team_index + 1} out of {teams_length} teams")
                await hold_script_execution(39000)

            batch_size = len(set_board_classification_errors)
            batch_urls = list(set_board_classification_errors.keys())[:batch_size]
            processed_urls = list(set(processed_urls) - set(batch_urls))
            error_retry_count += 1
            if error_retry_count > 7:
                print('Maximum amount of retry attempts for failed "set_board_classification" calls reached (7). Please review the "set_board_classification_errors" object to find out what the problem is...')
                return False
            elif error_retry_count == 7:
                print('This is the last attempt to retry failed "set_board_classification" calls...')

        print(f".........API URLs in this batch are:")
        print(json.dumps(batch_urls, indent=4))

        req_headers = {
            'cache-control': 'no-cache, no-store',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {API_TOKEN}'
        }

        try:
            async with aiohttp.ClientSession() as batch_set_board_classification_session:
                print("==== WITHIN THE BATCHES HTTP REQUESTS - Set Board Classification ======")
                batch_responses = await asyncio.gather(*[batch_set_board_classification_session.get(url, headers=req_headers) for url in batch_urls], return_exceptions=True)

                for response in batch_responses:
                    url = str(response.url)
                    status = response.status
                    if status == 200:
                        error_retry_count = 0
                        batch_data = await response.json()
                        teams_successfully_classified[team_id] = {
                            'team_id': team_id,
                            'team_name': teams[team_id]['team_name'],
                            'number_unclassified_boards_successfully_updated': batch_data['numberUpdatedBoards'] 
                        }
                        if DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS:
                            teams_successfully_classified[team_id]['number_boards_to_classify'] = len(teams[team_id]['unclassified_boards'])
                        del set_board_classification_remaining_teams[team_id]
                        set_board_classification_processed_items[team_id] = {
                            'team_id': team_id,
                            'team_name': teams[team_id]['team_name']
                        }
                        boards_successfully_classified = boards_successfully_classified + batch_data['numberUpdatedBoards']
                        if url in set_board_classification_errors:
                            del set_board_classification_errors[url]
                        if url in set_board_classification_exclusion_list:
                            del set_board_classification_exclusion_list[url]
                        if url not in global_processed_urls:
                            global_processed_urls[url] = {'requestStatus': 'valid response received'}
                        if url not in processed_urls:
                            processed_urls.append(url)
                        print(f'### All "NOT YET CLASSIFIED" Boards in Team {team_id} (Team {team_index + 1} out of {len(total_items)} were successfully updated - (Number of Updated Boards: {batch_data["numberUpdatedBoards"]}) - Already classified Boards were not updated ####')

                    elif isinstance(response, Exception):
                        set_board_classification_errors[url] = {'team': team_id, 'url': url, 'error': str(response)}
                        continue
                    else:
                        set_board_classification_errors[url] = {'team': team_id, 'url': url, 'error': status}

        except Exception as error:
            print(error)
            if api_url not in set_board_classification_errors:
                set_board_classification_errors[api_url] = {'team': team_id, 'url': api_url, 'error': str(error)}
            return await set_board_classification(team_id, team_index, teams_length)

        return {'results': results}
    else:
        print(f'# Setting Board Classification ONLY for "NOT YET CLASSIFIED" Boards within Team {team_id} (Team {team_index + 1} out of {teams_length}) - Already classified Boards will not be updated ...')
        teams_successfully_classified[team_id] = {
            'team_id': team_id,
            'team_name': teams[team_id]['team_name'],
            'number_unclassified_boards_successfully_updated': '0 (Test Mode ON)'
        }
        if DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS:
            teams_successfully_classified[team_id]['number_boards_to_classify'] = len(teams[team_id]['unclassified_boards'])
        print(f'....... TEST FLAG ON - Board classification action for Team {team_id} was skipped - (Team {team_index + 1} out of {teams_length}) ...')

        return True

async def get_unclassified_boards(team_id, team_index, teams_length, number_of_requests):
    global API_TOKEN, MIRO_ORG_ID, teams, get_unclassified_boards_errors, get_unclassified_boards_remaining_team_boards, get_unclassified_boards_processed_items, boards_object, boards_to_classify, global_processed_urls, get_unclassified_boards_exclusion_list, error_retry_count

    results = []
    total_items = teams[team_id]['all_boards']
    get_unclassified_boards_remaining_team_boards[team_id] = {board_id: {'id': board_id, 'boardUrl': f'https://miro.com/app/board/{board_id}/', 'team': team_id} for board_id in total_items}
    
    get_unclassified_boards_processed_items[team_id] = {}
    processed_urls = []
    teams[team_id]['unclassified_boards'] = []
    teams[team_id]['classified_boards'] = []
    batch_size = 0

    if len(total_items) == 0:
        print(f".... No boards found in Team {team_id}")

    while len(get_unclassified_boards_remaining_team_boards[team_id]) > 0:
        api_url = f'https://api.miro.com/v2/orgs/{MIRO_ORG_ID}/teams/{team_id}/boards'
        remaining_items = len(total_items) - len(get_unclassified_boards_processed_items[team_id])

        if len(get_unclassified_boards_errors) == 0:
            batch_size = min(number_of_requests, remaining_items)
            batch_urls = [f"{api_url}/{board_id}/data-classification" for board_id in list(get_unclassified_boards_remaining_team_boards[team_id].keys())[:batch_size]]
        else:
            if get_unclassified_boards_errors[list(get_unclassified_boards_errors.keys())[-1]]['error'] == 429:
                print(f"Processed Boards: {len(get_unclassified_boards_processed_items[team_id])} out of {len(total_items)} in Team {team_id} - Team {team_index + 1} out of {teams_length} teams")
                await hold_script_execution(39000)

            batch_size = len(get_unclassified_boards_errors)
            batch_urls = list(get_unclassified_boards_errors.keys())[:batch_size]
            processed_urls = list(set(processed_urls) - set(batch_urls))
            error_retry_count += 1
            if error_retry_count >= 8:
                print('Maximum amount of retry attempts for failed "getUnclassifiedBoards" calls reached (7). Please review the "getUnclassifiedBoardsErrors" object to find out what the problem is...')
                return False
            elif error_retry_count == 7:
                print('This is the third and last attempt to retry failed "getUnclassifiedBoards" calls...')

        print(f".........API URLs in this batch are:")
        print(json.dumps(batch_urls, indent=4))

        req_headers = {
            'cache-control': 'no-cache, no-store',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {API_TOKEN}'
        }

        try:
            async with aiohttp.ClientSession() as batch_get_unclassified_boards_session:
                print("==== WITHIN THE BATCHES HTTP REQUESTS - Get Unclassified Boards ======")
                batch_responses = await asyncio.gather(*[batch_get_unclassified_boards_session.get(url, headers=req_headers) for url in batch_urls], return_exceptions=True)

                for response in batch_responses:
                    url = str(response.url)
                    status = response.status
                    if status == 200:
                        error_retry_count = 0
                        batch_data = await response.json()
                        board_id = get_strings_between(url, 'boards/', '/data-classification')
                        teams[team_id]['classified_boards'].append(board_id)
                        boards_object[board_id]['board_url'] = f'https://miro.com/app/board/{board_id}/'
                        boards_object[board_id]['classification_label'] = batch_data['name']
                        boards_object[board_id]['team_id'] = team_id
                        boards_object[board_id]['team_name'] = teams[team_id]['team_name']
                        del get_unclassified_boards_remaining_team_boards[team_id][board_id]
                        get_unclassified_boards_processed_items[team_id][board_id] = {
                            'id': board_id,
                            'classification_label': 'not_yet_classified',
                            'boardUrl': f'https://miro.com/app/board/{board_id}/',
                            'team': team_id
                        }
                        if url in get_unclassified_boards_errors:
                            del get_unclassified_boards_errors[url]
                        if url in get_unclassified_boards_exclusion_list:
                            del get_unclassified_boards_exclusion_list[url]
                        if url not in global_processed_urls:
                            global_processed_urls[url] = {'requestStatus': 'valid response received'}
                        if url not in processed_urls:
                            processed_urls.append(url)

                    elif status == 404:
                        error_retry_count = 0
                        batch_data = await response.json()
                        board_id = get_strings_between(url, 'boards/', '/data-classification')
                        if batch_data['message'] == 'Board classification label was not found':
                            teams[team_id]['unclassified_boards'].append(board_id)
                            boards_object[board_id]['board_url'] = f'https://miro.com/app/board/{board_id}/'
                            boards_object[board_id]['classification_label'] = 'not_yet_classified'
                            boards_object[board_id]['team_id'] = team_id
                            boards_object[board_id]['team_name'] = teams[team_id]['team_name']
                            boards_to_classify.append(board_id)
                            del get_unclassified_boards_remaining_team_boards[team_id][board_id]
                            get_unclassified_boards_processed_items[team_id][board_id] = {
                                'id': board_id,
                                'classification_label': 'not_yet_classified',
                                'boardUrl': f'https://miro.com/app/board/{board_id}/',
                                'team': team_id
                            }
                        if url in get_unclassified_boards_errors:
                            del get_unclassified_boards_errors[url]
                        if url in get_unclassified_boards_exclusion_list:
                            del get_unclassified_boards_exclusion_list[url]
                        if url not in global_processed_urls:
                            global_processed_urls[url] = {'requestStatus': 'valid response received'}
                        if url not in processed_urls:
                            processed_urls.append(url)

                    elif status == 500:
                        board_id = get_strings_between(url, 'boards/', '/data-classification')
                        get_unclassified_boards_exclusion_list[url] = {
                            'team': team_id,
                            'url': url,
                            'error': status,
                            'errorMessage': '500 Internal Error',
                            'boardId': board_id,
                            'boardUrl': f'https://miro.com/app/board/{board_id}/'
                        }
                        del get_unclassified_boards_remaining_team_boards[team_id][board_id]
                    elif isinstance(response, Exception):
                        get_unclassified_boards_errors[url] = {'team': team_id, 'url': url, 'error': str(response)}
                        continue
                    else:
                        get_unclassified_boards_errors[url] = {'team': team_id, 'url': url, 'error': status}

            print(f"Processed Boards: {len(get_unclassified_boards_processed_items[team_id])} out of {len(total_items)} in Team {team_id} - Team {team_index + 1} out of {teams_length} teams")
        except Exception as error:
            print(error)
            if api_url not in get_unclassified_boards_errors:
                get_unclassified_boards_errors[api_url] = {'team': team_id, 'url': api_url, 'error': str(error)}
            return await get_unclassified_boards(team_id, team_index, teams_length, number_of_requests)

    return {'results': results}


async def get_boards(api_url, team_id, team_index, teams_length, number_of_requests):
    global global_processed_urls
    global get_boards_errors
    global teams
    global error_retry_count

    results = []
    processed_urls = []
    req_headers = {
        'cache-control': 'no-cache, no-store',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {API_TOKEN}'
    }

    try:
        async with aiohttp.ClientSession() as session:
            print('===========================================')
            async with session.get(api_url, headers=req_headers) as response:
                if response.status == 429:
                    await hold_script_execution(38000)
                    print(f'Rate limit hit for {api_url}, retrying after delay')
                    raise Exception(f'Rate limit hit for {api_url}: Response code {response.status}, Reason {response.reason}')
                if response.status != 200:
                    print(f'Non-OK status for {api_url}: Response code {response.status}, Reason {response.reason}')
                    raise Exception(f'Failed to fetch data from {api_url}: Response code {response.status}, Reason {response.reason}')
                print(f'Response status for {api_url}: {response.status} {response.reason}')
                
                if response.status == 200:
                    processed_urls.append(api_url)
                    if api_url not in global_processed_urls:
                        global_processed_urls[api_url] = {'requestStatus': 'valid response received'}
                    if api_url in get_boards_errors:
                        del get_boards_errors[api_url]

                    print(f'Getting Boards of Team {team_id} (Team No. {team_index + 1} of {teams_length}) - API URL --> {api_url}')
                    initial_data = await response.json()
                    total_items = initial_data['total']
                    processed_items = len(initial_data['data'])
                    ids_to_add = [item['id'] for item in initial_data['data']]
                    teams[team_id]['all_boards'].extend(ids_to_add)
                    results.extend(initial_data['data'])

                    while processed_items < total_items:
                        print(f'ProcessedItems --> {processed_items} out of {total_items} in Team ID {team_id} (Team {team_index} out of {teams_length})')
                        print(f'....Getting further Boards of Team {team_id} asynchronously in batches of max {number_of_requests} per batch')

                        remaining_items = total_items - processed_items
                        batch_size = min(number_of_requests, -(-remaining_items // 50))  # ceiling division
                        if get_boards_errors:
                            if list(get_boards_errors.values())[-1]['error'] == 429:
                                await hold_script_execution(38000)
                            batch_urls = [list(get_boards_errors.keys())[i] for i in range(batch_size)]
                            for url in processed_urls:
                                if url in batch_urls:
                                    batch_urls.remove(url)
                            error_retry_count += 1
                            if error_retry_count >= 7:
                                print('Maximum amount of retry attempts for failed "getBoards" calls reached (7). Please review the "getBoards" object to find out what the problem is...')
                                return False
                        else:
                            batch_urls = [f'{api_url}&offset={processed_items + i * 50}' for i in range(batch_size)]

                        print(f'.........API URLs for the batch are:')
                        print(json.dumps(batch_urls, indent=4))

                        async with aiohttp.ClientSession() as batch_session:
                            print("==== WITHIN THE BATCHES HTTP REQUESTS - Get Boards ======")
                            batch_responses = await asyncio.gather(*[batch_session.get(url, headers=req_headers) for url in batch_urls], return_exceptions=True)

                            for response in batch_responses:
                                if isinstance(response, Exception):
                                    continue
                                processed_urls.append(response.url)
                                error_retry_count = 0
                                if response.url not in global_processed_urls:
                                    global_processed_urls[response.url] = {'requestStatus': 'valid response received'}
                                if response.url in get_boards_errors:
                                    del get_boards_errors[response.url]

                                batch_data = await response.json()
                                ids_to_add = [item['id'] for item in batch_data['data']]
                                teams[team_id]['all_boards'].extend(ids_to_add)
                                processed_items += len(batch_data['data'])
                                results.extend(batch_data['data'])

                    return {'results': results}
    except Exception as error:
        print(error)
        print(f'Within Exception section')
        if api_url not in get_boards_errors:
            get_boards_errors[api_url] = {'team': team_id, 'url': api_url, 'error': str(error)}
        return await get_boards(api_url, team_id, team_index, teams_length, number_of_requests)
        

async def iterate_through_teams(teams_array):
    global error_retry_count
    if DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS:
        for index, team_id in enumerate(teams_array):
            api_url = f"https://api.miro.com/v2/boards?team_id={team_id}&limit=50"
            await get_boards(api_url, team_id, index, len(teams_array), GET_BOARDS_REQUESTS_BATCH_NUMBER)

        if get_boards_errors:
            print('Errors found. Holding execution for 25 seconds to allow Rate Limit Credits to replenish')
            await hold_script_execution(39000)
            global error_retry_count
            error_retry_count += 1
            if error_retry_count <= 7:
                if error_retry_count == 7:
                    print('This is the third and last attempt to retry failed "getBoards" calls...')
                await iterate_through_teams(get_boards_errors)
            else:
                print('Maximum amount of retry attempts for failed "getBoards" calls reached. Please review the errors array to find out what the problem is...')
                return False
        else:
            error_retry_count = 0

        if not get_boards_errors:
            return await iterate_through_boards(teams_array, False, False)
    else:
        print('.......Start Board Classification per Team...')
        for index, team_id in enumerate(teams_array):
            await set_board_classification(team_id, index, len(teams_array), GET_CLASSIFICATION_REQUESTS_BATCH_NUMBER)
    
    return True

async def call_api(url, options):
    async def manage_errors(response):
        if not response.status == 200:
            parsed_response = await response.json()
            response_error = {
                'status': response.status,
                'status_text': response.reason,
                'request_url': str(response.url),
                'error_details': parsed_response
            }
            raise Exception(response_error)
        return response

    async with aiohttp.ClientSession() as session:
        async with session.request(url=url, **options) as response:
            try:
                response = await manage_errors(response)

                rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
                if response.status == 204:
                    body = await response.text()
                else:
                    body = await response.json()

                return {
                    'status': response.status,
                    'rate_limit_remaining': rate_limit_remaining,
                    'body': body
                }
            except Exception as e:
                return {
                        'status': response.status,
                        'status_text': response.reason,
                        'request_url': str(response.url),
                        'error_details': str(e),
                        'rate_limit_remaining': 'error'
                    }

async def get_teams(session, org_id, cursor=None):
    global teams
    global boards_to_classify
    global boards_successfully_classified
    global get_teams_errors
    global get_boards_errors
    global get_unclassified_boards_errors
    global set_board_classification_errors
    global boards_object
    global get_boards_exclusion_list
    global set_board_classification_exclusion_list
    global get_unclassified_boards_exclusion_list
    global teams_successfully_classified
    global boards_to_classify

    req_headers = {
        'cache-control': 'no-cache, no-store',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {API_TOKEN}'
    }

    req_get_options = {
        'method': 'GET',
        'headers': req_headers,
        'data': None
    }

    url = f"https://api.miro.com/v2/orgs/{org_id}/teams" + (f"?cursor={cursor}" if cursor else '')
    print(f'Getting Miro Teams - API URL --> : {url}')
    list_teams = await call_api(url, req_get_options)
    
    if list_teams['status'] == 200:
        for team_data in list_teams['body']['data']:
            team_id = team_data['id']
            teams[team_id] = team_data
            teams[team_id]['team_id'] = str(team_id)
            teams[team_id]['team_name'] = str(teams[team_id]['name'])
            teams[team_id]['all_boards'] = []
            del teams[team_id]['id']
            del teams[team_id]['name']
        
        if 'cursor' in list_teams['body']:
            await get_teams(session, org_id, list_teams['body']['cursor'])
        else:
            print('Getting Miro Teams COMPLETE - Begin iterating through Teams to get Boards...')
            await iterate_through_teams(teams)

            print(f'Script end time: {datetime.datetime.now()}')
            print('********** FINAL SUMMARY **********')
            print('For further details review the "classification_output_files" folder within your local directory where this script lives')
            directory = 'classification_output_files'
            if not os.path.exists(directory):
                os.makedirs(directory)

            if DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS:
                print(f'====== Total Boards to classify --> {len(boards_to_classify)} ======')
                if get_unclassified_boards_exclusion_list:
                    print(f'***IMPORTANT: there were {len(get_unclassified_boards_exclusion_list)} Boards where the script could not retrieve the label data. It\'s possible that these {len(get_unclassified_boards_exclusion_list)} Boards were also unclassified making a total of {(len(boards_to_classify) + len(get_unclassified_boards_exclusion_list))} Boards to classify. These Boards are found in the file "board_classification_exclusion_list.json" ======')
                    with open('classification_output_files/board_classification_exclusion_list.json', 'w') as file:
                        json.dump(get_unclassified_boards_exclusion_list, file, indent=2)

                if get_boards_errors:
                    with open('classification_output_files/board_errors.json', 'w') as file:
                        json.dump(get_boards_errors, file, indent=2)

                if set_board_classification_exclusion_list:
                    with open('classification_output_files/set_board_classification_exclusion_list.json', 'w') as file:
                        json.dump(set_board_classification_exclusion_list, file, indent=2)

                if teams:
                    with open('classification_output_files/full_report_by_team_(before_update).json', 'w') as file:
                        json.dump(teams, file, indent=2)

                if boards_object:
                    with open('classification_output_files/full_report_by_board_(before_update).json', 'w') as file:
                        json.dump(boards_object, file, indent=2)
                    content = json_to_csv(boards_object)
                    with open('classification_output_files/full_report_by_board_(before_update).csv', 'w') as file:
                        file.write(content)

                if boards_to_classify:
                    with open('classification_output_files/boards_to_classify_(before_update).json', 'w') as file:
                        json.dump(boards_to_classify, file, indent=2)

            print(f'====== Total Boards successfully classified --> {("0 (TEST MODE IS ON)" if IS_TEST else boards_successfully_classified)} ======')
            print(f'====== Total Teams where "NO YET CLASSIFIED" boards were successfully classified --> {("0 (TEST MODE IS ON)" if IS_TEST else len(teams_successfully_classified))} ======')

            if get_unclassified_boards_exclusion_list:
                print(f'====== There are URLs in the "getUnclassifiedBoardsExclusionList" object. Please check --> ')
                print(json.dumps(get_unclassified_boards_exclusion_list, indent=2))
            if set_board_classification_exclusion_list:
                print(f'====== There are URLs in the "getUnclassifiedBoardsExclusionList" object. Please check --> ')
                print(json.dumps(set_board_classification_exclusion_list, indent=2))

            if teams_successfully_classified:
                content = json_to_csv(teams_successfully_classified)
                with open('classification_output_files/classification_result_(after_update).csv', 'w') as file:
                    file.write(content)

            final_summary_csv = 'total_boards_to_classify,total_boards_successfully_classified,total_teams_where_unclassified_boards_were_successfully_classified,observation\n'
            boards_to_classify_summary_string = str(len(boards_to_classify)) + (f'(Possibly{len(boards_to_classify) + len(get_unclassified_boards_exclusion_list)})' if get_unclassified_boards_exclusion_list else '')
            # final_summary_csv += f'{boards_to_classify_summary_string},{("0 (TEST MODE IS ON)" if IS_TEST else boards_successfully_classified)},{("0 (TEST MODE IS ON)" if IS_TEST else len(teams_successfully_classified))},{("TEST MODE WAS ON - No changes were performed" if IS_TEST else (f"There are {len(get_unclassified_boards_exclusion_list)} Boards that the script could not retrieve the label for. Its possible that these {len(get_unclassified_boards_exclusion_list)} Boards were also unclassified making a total of {(len(boards_to_classify) + len(get_unclassified_boards_exclusion_list))} Boards to classify. These Boards are found in the file board_classification_exclusion_list.json" if get_unclassified_boards_exclusion_list else ''))}'
            if IS_TEST:
                boards_to_classify_summary = "0 (TEST MODE IS ON)"
                successfully_classified = "0 (TEST MODE IS ON)"
                teams_classified = "0 (TEST MODE IS ON)"
                observation = "TEST MODE WAS ON - No changes were performed"
            else:
                boards_to_classify_summary = str(boards_to_classify)
                successfully_classified = str(boards_successfully_classified)
                teams_classified = str(len(teams_successfully_classified))
                if get_unclassified_boards_exclusion_list:
                    observation = (
                        f"There are {len(get_unclassified_boards_exclusion_list)} Boards that the script could not retrieve the label for. "
                        f"It's possible that these {len(get_unclassified_boards_exclusion_list)} Boards were also unclassified making a total of "
                        f"{(len(boards_to_classify) + len(get_unclassified_boards_exclusion_list))} Boards to classify. These Boards are found in the file board_classification_exclusion_list.json"
                    )
                else:
                    observation = ""

            final_summary_csv += f'{boards_to_classify_summary_string},{successfully_classified},{teams_classified},{observation}\n'

            with open('classification_output_files/final_summary.csv', 'w') as file:
                file.write(final_summary_csv)

            if not IS_TEST:
                print(f'# Next step: Please go to "https://miro.com/app/settings/company/{MIRO_ORG_ID}/data-classification/" to confirm that there are no Boards left to classify (fastest option) or re-run this script with TEST MODE turned ON (slower option)')
            print('********** END OF SCRIPT **********')

    elif list_teams['rate_limit_remaining'] == '0':
        await hold_script_execution(31000)
        await get_teams(session, org_id, cursor)
    else:
        print('====== ERROR - See details below ======')
        print(json.dumps(list_teams, indent=4))
        result = {
            'team_id': teams,
            'response_error': json.dumps(list_teams, indent=4),
            'full_error': list_teams
        }
        get_teams_errors.append(result)
        print('====== ERROR: Could not get all Teams, please check the errors above to learn what the problem is ======')
        print(f'Script end time: {datetime.datetime.now()}')
        print(f'********** END OF SCRIPT {("(IN TEST MODE)" if IS_TEST else "")} **********')
        return False

async def init():
    print(f"********** BEGIN OF SCRIPT {'(IN TEST MODE)' if IS_TEST else ''} **********")
    print(f"Script start time: {datetime.datetime.now()}")
    async with aiohttp.ClientSession() as session:
        await get_teams(session, MIRO_ORG_ID)
    return True

def ask_yes_no_question(question):
    while True:
        answer = input(question).strip().lower()
        if answer in ['y', 'n']:
            return answer
        else:
            print("Invalid answer. Please enter 'y' for yes or 'n' for no.")

def ask_number_question(question):
    while True:
        answer = input(question).strip()
        if answer.isdigit():
            return int(answer)
        else:
            print("Invalid answer. Please enter a valid number.")

def ask_any_input_question(question):
    return input(question).strip()

def ask_questions():
    global IS_TEST
    global DESIRED_CLASSIFICATION_LABEL_ID
    global MIRO_ORG_ID
    global API_TOKEN
    global DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS

    IS_TEST = ask_yes_no_question('Is this a TEST Run? (y/n):  ')
    if IS_TEST == 'y':
        IS_TEST = True
    else:
        IS_TEST = False
    DESIRED_CLASSIFICATION_LABEL_ID = ask_number_question('Enter the ID of the "Classification Label" to be used to classify the unclassified Boards: ')
    MIRO_ORG_ID = ask_number_question('Enter your Miro Organization ID: ')
    API_TOKEN = ask_any_input_question('Enter your Miro REST API Token: ')
    DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS = ask_yes_no_question('Should this script create a full report of existing boards? (y = slower / n = faster): ')
    if DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS == 'y':
        DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS = True
    else:
        DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS = False

def after_questions_answered():
    print("Thank you for answering the questions!")
    asyncio.run(init())

ask_questions()
after_questions_answered()
